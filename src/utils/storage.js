import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export const uploadToR2 = async (file, folder = 'lots') => {
  const fileName = `${folder}/${Date.now()}-${file.originalname}`;
  
  const uploadParams = {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await r2Client.send(new PutObjectCommand(uploadParams));
  return `${process.env.R2_PUBLIC_URL}/${fileName}`;
};

export const deleteFromR2 = async (fileUrl) => {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!fileUrl.startsWith(publicUrl)) return;

  const key = fileUrl.replace(`${publicUrl}/`, '');
  
  const deleteParams = {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  };

  await r2Client.send(new DeleteObjectCommand(deleteParams));
};

export default r2Client;
