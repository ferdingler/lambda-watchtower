# Serverless Uptime Monitor
Script for monitoring one or several HTTP(S) endpoints with AWS Lambda. Logs are stored as AWS CloudWatch metrics.

## Setup
Deploy in your AWS account using the Serverless Application Repository: 
https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:962675440091:applications~serverless-uptime-monitor

## Parameters
- `TargetUrl`: Target HTTP or HTTPS endpoint to monitor.
- `TargetName`: Name of the target, metrics will show up under this name in CloudWatch.
- `Timeout`: Time in ms before the request is aborted.
- `CloudWatchNamespace`: Defaults to _Watchtower_.
- `Frequency`: How frequent to monitor the endpoint (Allowed values: 1 minute, 5 minutes, 15 minutes).

## CloudWatch Metrics Available
The following metrics will be captured in CloudWatch:

- `lookup`: Time between beginning of request and successful DNS lookup
- `connect`: Time between DNS lookup and TCP connect
- `secureConnect`: Time between TCP connect and completion of HTTPS handshake
- `readable`: Time between successfully establishing the connection (and HTTPS handshake) and first byte received
- `close`: Time between first byte and the end of the request
- `total`: Total time from the beginning to the end of the request

## License
This code is available under the MIT license. See the `LICENSE` file.
