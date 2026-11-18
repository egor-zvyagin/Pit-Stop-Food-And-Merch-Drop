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

output "amplify_ssr_compute_role_arn" {
  value       = aws_iam_role.amplify_ssr_compute_role.arn
  description = "ARN of IAM role assumed by Amplify SSR compute runtime"
}

output "aws_region" {
  value       = var.aws_region
  description = "Target deployment region"
}
