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

resource "aws_iam_role" "amplify_ssr_compute_role" {
  name        = "pitstop-amplify-ssr-compute-role"
  description = "IAM role assumed by Amplify SSR compute runtime for DynamoDB access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "amplify.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "amplify_ssr_dynamodb_attachment" {
  role       = aws_iam_role.amplify_ssr_compute_role.name
  policy_arn = aws_iam_policy.dynamodb_access.arn
}

resource "aws_iam_role_policy_attachment" "amplify_ssr_logging_attachment" {
  role       = aws_iam_role.amplify_ssr_compute_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
