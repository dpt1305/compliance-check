# ── Key pair ─────────────────────────────────────────────────────────────────

resource "aws_key_pair" "compliance" {
  key_name   = var.ssh_key_name
  public_key = file(var.ssh_public_key_path)

  tags = {
    Name = var.ssh_key_name
  }
}

# ── EC2 Instance ──────────────────────────────────────────────────────────────

resource "aws_instance" "compliance" {
  ami                    = data.aws_ami.ubuntu_2404.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.compliance.key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    delete_on_termination = true
    encrypted             = true

    tags = {
      Name = "${var.project_name}-root-volume"
    }
  }

  # Enforce IMDSv2 (token-required) — blocks SSRF-based metadata theft
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = {
    Name = var.project_name
  }
}

# ── Elastic IP ────────────────────────────────────────────────────────────────
# Allocate before association so it survives instance stop/start

resource "aws_eip" "compliance" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-eip"
  }
}

resource "aws_eip_association" "compliance" {
  instance_id   = aws_instance.compliance.id
  allocation_id = aws_eip.compliance.id
}
