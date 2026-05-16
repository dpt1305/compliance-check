variable "aws_region" {
  description = "AWS region to deploy all resources (e.g. ap-southeast-1)"
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Project name used as a prefix for all resource names"
  type        = string
  default     = "compliance-app"
}

variable "environment" {
  description = "Environment label applied as a tag to every resource"
  type        = string
  default     = "production"
}

# ── EC2 ─────────────────────────────────────────────────────────────────────

variable "instance_type" {
  description = "EC2 instance type (t2.micro is free-tier eligible)"
  type        = string
  default     = "t2.micro"
}

variable "root_volume_size" {
  description = "EC2 root EBS volume size in GB (20 GB recommended — build artefacts)"
  type        = number
  default     = 20
}

variable "ssh_key_name" {
  description = "Name of the EC2 key pair created in AWS"
  type        = string
  default     = "compliance-app-key"
}

variable "ssh_public_key_path" {
  description = "Path to the local public SSH key file to upload as the key pair"
  type        = string
  default     = "~/.ssh/compliance-app.pub"
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed for SSH on port 22. Restrict to your IP (x.x.x.x/32) in production"
  type        = string
  default     = "0.0.0.0/0"
}

# ── S3 ──────────────────────────────────────────────────────────────────────

variable "s3_bucket_name" {
  description = "Globally unique S3 bucket name for compliance image storage"
  type        = string
  default     = "my-compliance-images"
}

# ── Networking ───────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet (must be within vpc_cidr)"
  type        = string
  default     = "10.0.1.0/24"
}
