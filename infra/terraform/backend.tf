terraform {
  backend "s3" {
    bucket       = "pitstop-tfstate-608531435714-ap-southeast-2"
    key          = "pitstop/production/terraform.tfstate"
    region       = "ap-southeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
