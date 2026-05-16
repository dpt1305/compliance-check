output "elastic_ip" {
  description = "Elastic IP — add this as an A record in your DNS to point your domain here"
  value       = aws_eip.compliance.public_ip
}

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.compliance.id
}

output "ec2_ami_id" {
  description = "Ubuntu 24.04 LTS AMI used for the instance"
  value       = data.aws_ami.ubuntu_2404.id
}

output "s3_bucket_name" {
  description = "S3 bucket name — set as AWS_S3_BUCKET in .env.production"
  value       = aws_s3_bucket.images.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.images.arn
}

output "iam_role_name" {
  description = "IAM role attached to the EC2 instance (no static AWS keys needed)"
  value       = aws_iam_role.ec2.name
}

output "ssh_connect" {
  description = "SSH command to connect to the server (replace with your actual .pem path)"
  value       = "ssh -i ~/.ssh/compliance-app.pem ubuntu@${aws_eip.compliance.public_ip}"
}

output "storage_image_base_url_hint" {
  description = "Set STORAGE_IMAGE_BASE_URL in .env.production once your domain is configured"
  value       = "https://<your-domain>/api/images/"
}
