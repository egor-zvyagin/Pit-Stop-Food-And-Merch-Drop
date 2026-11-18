variable "aws_region" {
  type        = string
  description = "AWS deployment region"
  default     = "ap-southeast-2"
}

variable "environment" {
  type        = string
  description = "Environment name"
  default     = "production"
}

variable "table_name" {
  type        = string
  description = "Name of the DynamoDB single table"
  default     = "pitstop_data"
}

variable "owner" {
  type        = string
  description = "Resource owner tag"
  default     = "PitStop-Platform"
}

variable "enable_point_in_time_recovery" {
  type        = bool
  description = "Enable DynamoDB point-in-time recovery"
  default     = true
}
