
variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "AWS CLI profile"
  type        = string
  default     = "ecommerce-devops"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "ecommerce"
}

variable "services" {
  description = "Microservices requiring ECR repositories"
  type        = set(string)

  default = [
    "user-service",
    "product-service",
    "order-service",
    "payment-service",
    "notification-service"
  ]
}
