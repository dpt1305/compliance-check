# ── Trust policy — allow EC2 service to assume this role ─────────────────────

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# ── IAM Role ─────────────────────────────────────────────────────────────────

resource "aws_iam_role" "ec2" {
  name               = "ComplianceEC2Role"
  description        = "Attached to the compliance EC2 instance; grants S3 access without static keys"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = {
    Name = "ComplianceEC2Role"
  }
}

# ── S3 permission policy ──────────────────────────────────────────────────────

data "aws_iam_policy_document" "s3_compliance" {
  statement {
    sid    = "AllowComplianceS3"
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]

    resources = [
      aws_s3_bucket.images.arn,
      "${aws_s3_bucket.images.arn}/*",
    ]
  }
}

resource "aws_iam_policy" "s3_compliance" {
  name        = "ComplianceS3Policy"
  description = "Allow the compliance EC2 instance to read/write the compliance images S3 bucket"
  policy      = data.aws_iam_policy_document.s3_compliance.json

  tags = {
    Name = "ComplianceS3Policy"
  }
}

# ── Attach policy to role ─────────────────────────────────────────────────────

resource "aws_iam_role_policy_attachment" "ec2_s3" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.s3_compliance.arn
}

# ── Instance profile — wraps the role so it can be attached to EC2 ────────────

resource "aws_iam_instance_profile" "ec2" {
  name = "ComplianceEC2InstanceProfile"
  role = aws_iam_role.ec2.name

  tags = {
    Name = "ComplianceEC2InstanceProfile"
  }
}
