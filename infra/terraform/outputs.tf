output "dynamodb_table_name" {
  value       = aws_dynamodb_table.pitstop_table.name
  description = "DynamoDB table name"
}

output "dynamodb_table_arn" {
  value       = aws_dynamodb_table.pitstop_table.arn
  description = "DynamoDB table ARN"
}

output "dynamodb_iam_policy_arn" {
  value       = aws_iam_policy.dynamodb_access.arn
  description = "ARN of IAM policy granting least-privilege access to the DynamoDB table"
}

output "aws_region" {
  value       = var.aws_region
  description = "Target deployment region"
}
