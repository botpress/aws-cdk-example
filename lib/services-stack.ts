import * as cdk from "@aws-cdk/core";
import ec2 = require("@aws-cdk/aws-ec2");
import ecs = require("@aws-cdk/aws-ecs");
import route53 = require("@aws-cdk/aws-route53");
import rds = require("@aws-cdk/aws-rds");
import elbv2 = require("@aws-cdk/aws-elasticloadbalancingv2");
import logs = require("@aws-cdk/aws-logs");

export interface ServicesStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class ServicesStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      { memoryLimitMiB: 3072, cpu: 512 }
    );

    const bpContainer = taskDefinition.addContainer("bp", {
      image: ecs.ContainerImage.fromRegistry("botpress/server:v12_16_2"),
      entryPoint: ["/bin/sh", "-c"],
      command: ["./duckling -p 8000 & ./bp"],
      essential: true,
      environment: {
        //   DATABASE_URL: `postgres://master:${dbPassword.secretValue}@${dbClusterEndpointAddress}/bpteam`,
        //   REDIS_URL: `redis://${redisEndpointAddress}:${redisEndpointPort}`,
        //   BP_PRODUCTION: "true",
        //   BP_MODULES_PATH: "/botpress/modules:/botpress/additional-modules",
        //   BP_DECISION_MIN_NO_REPEAT: "1ms",
        //   BPFS_STORAGE: "database",
        //   EXTERNAL_URL: `https://${domain}`,
        //   CLUSTER_ENABLED: "true",
        //   PRO_ENABLED: "true",
        //   BP_LICENSE_KEY: bpLicenseKey.toString(),
        //   EXPOSED_PRIVATE_API_SECRET: bpApiSecret.toString(),
        //   EXPOSED_API_KEY_GORDON: gordonApiKey.toString(),
        //   EXPOSED_LICENSE_SERVER: "https://license.botpress.io/",
        //   VERBOSITY_LEVEL: "3",
        AUTO_MIGRATE: "true",
        DATABASE_POOL: '{"min": 2, "max": 5}',
      },
      logging: ecs.LogDrivers.awsLogs({
        logRetention: logs.RetentionDays.ONE_MONTH,
        streamPrefix: "bp",
      }),
      // healthCheck: {
      //   command: [
      //     "CMD-SHELL",
      //     "curl -f http://localhost:3000/status || exit 1",
      //   ],
      //   timeout: cdk.Duration.seconds(5),
      //   retries: 3,
      //   startPeriod: cdk.Duration.seconds(30),
      //   interval: cdk.Duration.seconds(30),
      // },
    });

    bpContainer.addPortMappings({ containerPort: 3000 });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
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
