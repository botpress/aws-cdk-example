#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { VpcStack } from "../lib/vpc-stack";
import { DatabaseStack } from "../lib/database-stack";
import { ServicesStack } from "../lib/services-stack";

const app = new cdk.App();

const { vpc } = new VpcStack(app, "VpcStack");

const {
  masterDbPasswordSecret,
  dbClusterEndpoint,
  dbClusterSecurityGroup,
} = new DatabaseStack(app, "DatabaseStack", {
  vpc,
});

new ServicesStack(app, "ServicesStack", {
  vpc,
  masterDbPasswordSecret,
  dbClusterEndpoint,
  dbClusterSecurityGroup,
});
