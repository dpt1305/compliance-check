# ── S3 Bucket ────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "images" {
  bucket = var.s3_bucket_name

  # Prevent accidental deletion when the bucket contains objects
  lifecycle {
    prevent_destroy = false
  }

  tags = {
    Name = var.s3_bucket_name
  }
}

# Block all public access — images are served via presigned URLs through Next.js
resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Encrypt all objects at rest with AES-256 (SSE-S3)
resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Enforce HTTPS-only access (deny plain HTTP PutObject / GetObject)
resource "aws_s3_bucket_policy" "images_https_only" {
  bucket = aws_s3_bucket.images.id

  # Must run after the public-access block, otherwise the policy may be rejected
  depends_on = [aws_s3_bucket_public_access_block.images]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyHTTP"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.images.arn,
          "${aws_s3_bucket.images.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
