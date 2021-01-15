# Botpress Example with AWS CDK

An example of a AWS CDK app for a single-node deployment of Botpress, with a Postgresql database.

## Useful commands

### Compiling

`npm run-script watch`

### Diffing

`npx cdk diff '*' --profile {your AWS profile}`

### Deploying

`npx cdk deploy '*' --profile {your AWS profile}`

### Connecting to the database

1. In a terminal, from the `scripts/` directory: `AWS_PROFILE={your AWS profile} AWS_DEFAULT_REGION={your AWS region, e.g. us-east-1} ./connect.sh -o 3000 {the DNS name for your RDS instance, see RDS console to get it} 5432`
2. In another terminal, `psql -h localhost -p 3000 -U master postgres`. The password can be found in AWS Secrets Manager
