import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error('Vui lòng định nghĩa biến môi trường MONGODB_URI bên trong file .env');
}

// Khởi tạo biến global để cache kết nối trong môi trường phát triển (Next.js hot-reload)
let cached = (global as any).mongoose;

if (!cached) {
    cached = (global as any).mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
    if (cached.conn) {
        console.log('Sử dụng kết nối MongoDB đã cache');
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
            console.log('MongoDB connected thành công');
            return mongoose;
        });
    }
    cached.conn = await cached.promise;
    return cached.conn;
};