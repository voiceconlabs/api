import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface IUploadResult {
  key: string;
  url: string;
  bucket: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME')!;
    this.endpoint = this.configService.get<string>('R2_ENDPOINT')!;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: this.configService.get<string>('R2_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('R2_SECRET_ACCESS_KEY')!,
      },
    });
  }

  async uploadFile(
    file: Buffer,
    folder: string,
    filename: string,
    contentType: string,
  ): Promise<IUploadResult> {
    const key = `${folder}/${Date.now()}-${filename}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: contentType,
      }),
    );

    this.logger.log(`Uploaded file: ${key}`);

    return {
      key,
      url: `${this.endpoint}/${key}`,
      bucket: this.bucketName,
    };
  }

  async uploadVideo(file: Buffer, meetingId: string): Promise<IUploadResult> {
    return this.uploadFile(file, `meetings/${meetingId}`, 'video.webm', 'video/webm');
  }

  async uploadAudio(file: Buffer, meetingId: string): Promise<IUploadResult> {
    return this.uploadFile(file, `meetings/${meetingId}`, 'audio.wav', 'audio/wav');
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    this.logger.log(`Deleted file: ${key}`);
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks);
  }

  getPublicUrl(key: string): string {
    return `${this.endpoint}/${key}`;
  }
}
