resource "aws_iam_policy" "dynamodb_access" {
  name        = "${var.table_name}-access-policy"
  description = "Least-privilege IAM policy for Pit Stop application to access DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:DescribeTable"
        ]
        Resource = [
          aws_dynamodb_table.pitstop_table.arn,
          "${aws_dynamodb_table.pitstop_table.arn}/index/*"
        ]
      }
    ]
  })
}
