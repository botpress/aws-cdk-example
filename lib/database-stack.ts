import * as cdk from "@aws-cdk/core";
import * as rds from "@aws-cdk/aws-rds";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class DatabaseStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    const cluster = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_11_9,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("clusteradmin"),
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

    const postgresRestoreRole = new iam.Role(this, "PostgresRestoreRole", {
      assumedBy: new iam.ServicePrincipal("ec2"),
    });

    // Enables instances to use AWS SSM
    postgresRestoreRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "yum -y install ec2-instance-connect"
      // 'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
      // "unzip -q awscliv2.zip",
      // "./aws/install",
      // "rm -dr aws awscliv2.zip",
      // "yum remove -y postgresql postgresql-server",
      // "yum install -y https://download.postgresql.org/pub/repos/yum/11/redhat/rhel-6-x86_64/postgresql11-libs-11.4-1PGDG.rhel6.x86_64.rpm",
      // "yum install -y https://download.postgresql.org/pub/repos/yum/11/redhat/rhel-6-x86_64/postgresql11-11.4-1PGDG.rhel6.x86_64.rpm"
    );

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
  }
}
