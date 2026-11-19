# CloudWatch Dashboard & Metric Alarm (free-tier)

locals {
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Consumed Capacity"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", var.table_name, { label = "Read CU", stat = "Sum", period = 300 }],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", var.table_name, { label = "Write CU", stat = "Sum", period = 300 }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Errors"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/DynamoDB", "UserErrors", "TableName", var.table_name, { label = "User Errors", stat = "Sum", period = 300 }],
            ["AWS/DynamoDB", "SystemErrors", "TableName", var.table_name, { label = "System Errors", stat = "Sum", period = 300 }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          title  = "DynamoDB Successful Request Latency (ms)"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", var.table_name, "Operation", "GetItem", { label = "GetItem p99", stat = "p99", period = 300 }],
            ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", var.table_name, "Operation", "PutItem", { label = "PutItem p99", stat = "p99", period = 300 }],
            ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", var.table_name, "Operation", "Query", { label = "Query p99", stat = "p99", period = 300 }]
          ]
          period = 300
        }
      }
    ]
  })
}

resource "aws_cloudwatch_dashboard" "pitstop_ops" {
  dashboard_name = "pitstop-production-dashboard"
  dashboard_body = local.dashboard_body
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_system_errors" {
  alarm_name          = "pitstop-dynamodb-system-errors"
  alarm_description   = "Fires when DynamoDB SystemErrors > 0 on table ${var.table_name}"
  namespace           = "AWS/DynamoDB"
  metric_name         = "SystemErrors"
  dimensions          = { TableName = var.table_name }
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
}
