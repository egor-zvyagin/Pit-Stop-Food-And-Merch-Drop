resource "aws_dynamodb_table" "pitstop_table" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST" # 100% Scale-to-Zero, $0 idle cost
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "GSI2SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  ttl {
    enabled        = true
    attribute_name = "ttl"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  # The table holds every order and all stock levels. Two guards against
  # losing it: AWS refuses a delete while deletion protection is on, and
  # Terraform refuses any plan that would destroy or replace the table.
  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = var.table_name
  }
}
