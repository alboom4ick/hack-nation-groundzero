# Aurora Serverless v2 (PostgreSQL) for the action-tree store. Public endpoint, password + TLS, as chosen.
# Usage: cd infra && terraform init && terraform apply. The connection string lands in infra/db.env (gitignored).
terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    local  = { source = "hashicorp/local", version = "~> 2.5" }
  }
}

variable "region" { default = "us-west-1" }
provider "aws" { region = var.region }

data "aws_vpc" "default" { default = true }
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "groundzero" {
  name       = "groundzero-actions"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "db" {
  name        = "groundzero-actions-db"
  description = "Postgres from anywhere; protected by password and TLS (Vercel has no fixed IP)"
  vpc_id      = data.aws_vpc.default.id
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_rds_cluster" "groundzero" {
  cluster_identifier        = "groundzero-actions"
  engine                    = "aurora-postgresql"
  engine_version            = "17.9"
  database_name             = "groundzero"
  master_username           = "groundzero"
  master_password           = random_password.db.result
  db_subnet_group_name      = aws_db_subnet_group.groundzero.name
  vpc_security_group_ids    = [aws_security_group.db.id]
  storage_encrypted         = true
  backup_retention_period   = 1
  skip_final_snapshot       = true
  apply_immediately         = true
  serverlessv2_scaling_configuration {
    min_capacity             = 0
    max_capacity             = 1
    seconds_until_auto_pause = 300
  }
}

resource "aws_rds_cluster_instance" "writer" {
  cluster_identifier  = aws_rds_cluster.groundzero.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.groundzero.engine
  engine_version      = aws_rds_cluster.groundzero.engine_version
  publicly_accessible = true
}

resource "local_sensitive_file" "env" {
  filename = "${path.module}/db.env"
  content  = "DATABASE_URL=postgres://groundzero:${random_password.db.result}@${aws_rds_cluster.groundzero.endpoint}:5432/groundzero?sslmode=require\n"
}

output "endpoint" { value = aws_rds_cluster.groundzero.endpoint }
