terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "ecommerce-terraform-state-354452812573"
    key          = "ecommerce/dev/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
    profile      = "ecommerce-devops"
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}