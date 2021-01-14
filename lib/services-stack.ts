import * as cdk from "@aws-cdk/core";
import ec2 = require("@aws-cdk/aws-ec2");
import ecs = require("@aws-cdk/aws-ecs");
import rds = require("@aws-cdk/aws-rds");
import elbv2 = require("@aws-cdk/aws-elasticloadbalancingv2");
import logs = require("@aws-cdk/aws-logs");
import cr = require("@aws-cdk/custom-resources");
import secretsmanager = require("@aws-cdk/aws-secretsmanager");

export interface ServicesStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  masterDbPasswordSecret: secretsmanager.ISecret;
  dbClusterEndpoint: rds.Endpoint;
  dbClusterSecurityGroup: ec2.ISecurityGroup;
}

export class ServicesStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);

    const {
      vpc,
      masterDbPasswordSecret,
      dbClusterEndpoint,
      dbClusterSecurityGroup,
    } = props;

    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      { memoryLimitMiB: 3072, cpu: 512 }
    );

    const masterPasswordGetter = new cr.AwsCustomResource(
      this,
      "MasterPasswordGetter",
      {
        onUpdate: {
          service: "SecretsManager",
          action: "getSecretValue",
          parameters: { SecretId: masterDbPasswordSecret.secretArn },
          physicalResourceId: cr.PhysicalResourceId.of("MasterPasswordGetter"),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );
    const masterPassword = masterPasswordGetter.getResponseField(
      "SecretString"
    );

    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
    });

    // Allow outgoing connections to Posgresql cluster
    dbClusterSecurityGroup.addIngressRule(
      securityGroup,
      ec2.Port.tcp(dbClusterEndpoint.port),
      "Postgresql access",
      true
    );

    const bpContainer = taskDefinition.addContainer("bp", {
      image: ecs.ContainerImage.fromRegistry("botpress/server:v12_16_2"),
      entryPoint: ["/bin/sh", "-c"],
      command: ["./duckling -p 8000 & ./bp"],
      essential: true,
      environment: {
        DATABASE_URL: `postgres://master:${masterPassword}@${dbClusterEndpoint.socketAddress}/testdb`,
        BPFS_STORAGE: "database",
        AUTO_MIGRATE: "true",
        DATABASE_POOL: '{"min": 2, "max": 5}',
      },
      logging: ecs.LogDrivers.awsLogs({
        logRetention: logs.RetentionDays.ONE_MONTH,
        streamPrefix: "bp",
      }),
    });

    bpContainer.addPortMappings({ containerPort: 3000 });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      securityGroups: [securityGroup],
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LB", {
      vpc: cluster.vpc,
      internetFacing: true,
    });

    const listener80 = loadBalancer.addListener("Listener80", {
      port: 80,
    });

    listener80.addTargets("Dev", {
      port: 80,
      healthCheck: {
        path: "/status",
        interval: cdk.Duration.seconds(60),
        healthyThresholdCount: 2,
        timeout: cdk.Duration.seconds(10),
        unhealthyThresholdCount: 10,
      },
      targets: [service],
      stickinessCookieDuration: cdk.Duration.hours(1),
    });
  }
}
