import * as cdk from "@aws-cdk/core";
import * as rds from "@aws-cdk/aws-rds";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import secretsmanager = require("@aws-cdk/aws-secretsmanager");

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class DatabaseStack extends cdk.Stack {
  public readonly masterDbPasswordSecret: secretsmanager.ISecret;
  public readonly dbClusterEndpoint: rds.Endpoint;
  public readonly dbClusterSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: cdk.Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    this.masterDbPasswordSecret = new secretsmanager.Secret(
      this,
      "MasterPassword",
      {
        generateSecretString: { excludePunctuation: true, includeSpace: false },
      }
    );

    const cluster = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_11_9,
      }),
      credentials: {
        username: "master",
        password: this.masterDbPasswordSecret.secretValue,
      },
      instances: 1,
      instanceProps: {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.R5,
          ec2.InstanceSize.LARGE
        ),
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE,
        },
        vpc,
      },
    });
    this.dbClusterEndpoint = cluster.clusterEndpoint;

    const postgresRestoreRole = new iam.Role(this, "PostgresRestoreRole", {
      assumedBy: new iam.ServicePrincipal("ec2"),
    });

    // Enables instances to use AWS SSM
    postgresRestoreRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands("yum -y install ec2-instance-connect");

    const jumpbox = new ec2.Instance(this, "Jumpbox", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.NANO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      // securityGroup: restoringInstanceSecurityGroup,
      userData,
      role: postgresRestoreRole,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Tag used by the connect script to SSH into the instance
    cdk.Tags.of(jumpbox).add("JumpboxFor", "db", {
      applyToLaunchedInstances: true,
    });

    cluster.connections.allowDefaultPortFrom(jumpbox);

    this.dbClusterSecurityGroup = cluster.connections.securityGroups[0];
  }
}
