
output "ecr_repository_urls" {
  description = "ECR repository URLs"

  value = {
    for service, repository in aws_ecr_repository.services :
    service => repository.repository_url
  }
}
