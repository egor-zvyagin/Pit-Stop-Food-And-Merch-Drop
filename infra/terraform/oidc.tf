# GitHub Actions OIDC Federation
# OIDC provider for token.actions.githubusercontent.com (created fresh — none existed in account 608531435714)

resource "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub's OIDC thumbprint (SHA-1 of the root CA cert)
  # https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc_verify-thumbprint.html
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:egor-zvyagin/Pit-Stop-Food-And-Merch-Drop:*"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "github_actions_terraform" {
  name        = "pitstop-github-actions-terraform-role"
  description = "IAM role assumed by GitHub Actions via OIDC for Terraform deployments"

  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json

  max_session_duration = 3600
}

# Least-privilege inline policy: manage DynamoDB pitstop_data,
# its IAM policies/roles, CloudWatch dashboard/alarms, and S3 state bucket.
resource "aws_iam_policy" "github_actions_terraform_policy" {
  name        = "pitstop-github-actions-terraform-policy"
  description = "Least-privilege policy for GitHub Actions Terraform role"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBManage"
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable",
          "dynamodb:DeleteTable",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:ListTagsOfResource",
          "dynamodb:TagResource",
          "dynamodb:UntagResource",
          "dynamodb:UpdateContinuousBackups",
          "dynamodb:UpdateTable",
          "dynamodb:UpdateTimeToLive",
          "dynamodb:UpdateContributorInsights",
          "dynamodb:DescribeContributorInsights",
          "dynamodb:EnableKinesisStreamingDestination",
          "dynamodb:DisableKinesisStreamingDestination"
        ]
        Resource = [
          "arn:aws:dynamodb:ap-southeast-2:608531435714:table/pitstop_data",
          "arn:aws:dynamodb:ap-southeast-2:608531435714:table/pitstop_data/index/*"
        ]
      },
      {
        Sid    = "IAMManage"
        Effect = "Allow"
        Action = [
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicyVersions",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:TagPolicy",
          "iam:UntagPolicy",
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:UpdateRole",
          "iam:UpdateRoleDescription",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PassRole",
          "iam:CreateOpenIDConnectProvider",
          "iam:DeleteOpenIDConnectProvider",
          "iam:GetOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviders",
          "iam:TagOpenIDConnectProvider",
          "iam:UpdateOpenIDConnectProviderThumbprint",
          "iam:AddClientIDToOpenIDConnectProvider",
          "iam:RemoveClientIDFromOpenIDConnectProvider"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchManage"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutDashboard",
          "cloudwatch:DeleteDashboards",
          "cloudwatch:GetDashboard",
          "cloudwatch:ListDashboards",
          "cloudwatch:PutMetricAlarm",
          "cloudwatch:DeleteAlarms",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:DescribeAlarmsForMetric",
          "cloudwatch:ListTagsForResource",
          "cloudwatch:TagResource",
          "cloudwatch:UntagResource"
        ]
        Resource = "*"
      },
      {
        Sid    = "BudgetsManage"
        Effect = "Allow"
        Action = [
          "budgets:ViewBudget",
          "budgets:ModifyBudget",
          "budgets:CreateBudget",
          "budgets:DeleteBudget"
        ]
        Resource = "arn:aws:budgets::608531435714:budget/*"
      },
      {
        Sid    = "S3StateManage"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetBucketVersioning",
          "s3:PutBucketVersioning",
          "s3:GetBucketLocation",
          "s3:GetEncryptionConfiguration"
        ]
        Resource = [
          "arn:aws:s3:::pitstop-tfstate-608531435714-ap-southeast-2",
          "arn:aws:s3:::pitstop-tfstate-608531435714-ap-southeast-2/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_actions_terraform_attach" {
  role       = aws_iam_role.github_actions_terraform.name
  policy_arn = aws_iam_policy.github_actions_terraform_policy.arn
}
