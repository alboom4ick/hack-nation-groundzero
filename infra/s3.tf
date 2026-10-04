# Private bucket for the videos that belong to action trees. The browser uploads and plays through
# short-lived presigned URLs; nothing in the bucket is public.
data "aws_caller_identity" "me" {}

resource "aws_s3_bucket" "videos" {
  bucket = "groundzero-action-videos-${data.aws_caller_identity.me.account_id}"
}

resource "aws_s3_bucket_public_access_block" "videos" {
  bucket                  = aws_s3_bucket.videos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "videos" {
  bucket = aws_s3_bucket.videos.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_cors_configuration" "videos" {
  bucket = aws_s3_bucket.videos.id
  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# The app's own identity (for Vercel): it may only read, write and delete objects in this bucket.
resource "aws_iam_user" "app" { name = "groundzero-app" }

resource "aws_iam_user_policy" "app" {
  name = "action-videos"
  user = aws_iam_user.app.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.videos.arn}/*"
    }]
  })
}

resource "aws_iam_access_key" "app" { user = aws_iam_user.app.name }

resource "local_sensitive_file" "s3env" {
  filename = "${path.module}/s3.env"
  content  = "S3_VIDEO_BUCKET=${aws_s3_bucket.videos.bucket}\nAWS_REGION=${var.region}\nAWS_ACCESS_KEY_ID=${aws_iam_access_key.app.id}\nAWS_SECRET_ACCESS_KEY=${aws_iam_access_key.app.secret}\n"
}

output "video_bucket" { value = aws_s3_bucket.videos.bucket }
