const fs = require('fs');
// const LIMIT_MAX = 9223372036854775807n;
const LIMIT_MAX = Number.MAX_SAFE_INTEGER;

class ByteBuffer {
    constructor(buffer) {
        this.data = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
        this.pos = 0; // 当前读写位置
        this.limit = LIMIT_MAX; // 限制读取的最大字节数
    }

    // 从 Reader 创建 ByteBuffer
    static async NewByteBufferFromReader(reader) {
        const chunks = [];
        for await (const chunk of reader) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        // // 转换为 uint8 数组形式
        // const uint8buffer = Array.from(buffer);
        // // 打印结果
        // console.log(uint8buffer);

        // // 以十六进制格式打印数据
        // console.log("Hex Dump of Data:\n", buffer.toString('hex'));
        
        const byteBuffer = new ByteBuffer(buffer);
        return byteBuffer;
    }

    // 返回当前流的位置
    Pos() {
        return this.pos;
    }

    // 返回当前缓冲区大小
    Size() {
        return Math.min(this.limit, this.data.length);
    }

    // 判断是否到达流的末尾
    EOF() {
        if (this.pos >= this.limit) {
            return true;
        }
        if (this.pos >= this.data.length) {
            return true;
        }
        return false;
    }

    setLimit(limit) {
        let oldLimit = this.limit;
        this.limit = limit;

        if (this.limit !== LIMIT_MAX) { 
            // 如果设置了 limit，则调整数据大小
            if (this.limit > this.data.length) {
                // if (this.limit > this.data.capacity) { // JavaScript 中数组没有 `cap`，这里假设 `capacity`
                //     this.expandCap(this.limit);
                // }
                // this.data.length = this.limit; // 调整 data 长度
                // 如果 limit 大于当前数据长度，扩展容量
                this.expandCap(this.limit);
                // 截取数据到 limit 大小
                this.data = this.data.slice(0, this.limit);
            }
           
        }

        return oldLimit;
    }

    expandCap(newSize) {
        if (newSize > this.data.length) {
          const newData = new Array(newSize);  // 创建一个新的数组，长度为 newSize
          // 复制旧数据到新数组
          for (let i = 0; i < this.data.length; i++) {
            newData[i] = this.data[i];
          }
          this.data = newData;  // 更新数据为新数组
        }
    }

    // Read 实现 io.Reader 接口
    read(p) {
        if (this.EOF()) {
            return [0, 'EOF']; // 模拟 Go 中的 io.EOF
        }

        // 计算可以读取的剩余字节数
        const maxRead = this.limit - this.pos;
        if (p.length > maxRead) {
            p = p.slice(0, maxRead); // 限制读取的字节数不超过剩余量
        }

         // 复制数据到 p
        this.data.copy(p, 0, this.pos, this.data.length);  // 从 this.pos 位置开始到结束复制到 p
         // 计算可复制的字节数，确保不会超出目标缓冲区的大小
        let n = Math.min(p.length, this.data.length - this.pos);  // 确保不超出数据或目标缓冲区
        this.pos += n;

        return [n, null]; // 返回已读取字节数和无错误的标志
    }

    /**
     * Seek 实现，支持 io.Seeker 类似的行为
     * @param {number} offset - 偏移量 (相当于 int64)
     * @param {number} whence - 参考位置 (0=开始, 1=当前位置, 2=末尾)
     * @returns {[number, Error|null]} - 返回新的位置或错误
     */
    seek(offset, whence) {
        let newPos;
        switch (whence) {
            case 0: // io.SeekStart (从起始位置计算)
                newPos = offset;
                break;
            case 1: // io.SeekCurrent (从当前位置计算)
                newPos = this.pos + offset;
                break;
            case 2: // io.SeekEnd (从末尾计算)
                if (this.limit === Number.MAX_SAFE_INTEGER) {
                    newPos = this.data.length + offset;
                } else {
                    newPos = this.limit + offset;
                }
                break;
            default:
                return [0, new Error("invalid whence")];
        }

        if (newPos < 0 || newPos > this.limit) {
            return [0, new Error("seek out of bounds")];
        }

        if (newPos < 0 || newPos > this.data.length) {
            return [0, new Error("invalid seek position")];
        }

        this.pos = newPos;
        return [this.pos, null];
    }
}

class Stream {
    constructor(byteBuffer) {
        this.byteBuf = byteBuffer;
        this.buf = Buffer.alloc(9); // 额外一个字节用于位操作
        this.bigEndian = true; // 默认大端字节序
        this.bitsLeft = 0;
        this.bits = 0n;
    }

    // 从 Reader 创建 Stream
    static async NewStreamFromReader(reader) {
        const byteBuf = await ByteBuffer.NewByteBufferFromReader(reader);
        return new Stream(byteBuf);
    }

     // 设置当前默认Endian设置，返回之前的Endian设置
    setDefaultEndian(bigEndian) {
        const oldEndian = this.bigEndian; // 保存当前的字节序
        this.bigEndian = bigEndian; // 设置新的字节序
        return oldEndian; // 返回旧的字节序
    }

    // 获取当前流的位置
    getPos() {
        return this.byteBuf.Pos();
    }

    seek(offset, whence) {
        return this.byteBuf.seek(offset, whence);
    }

    seekPos(pos) {
        const [_, err] = this.seek(pos, 0); // 0 对应 io.SeekStart
        return err;
    }

    // 返回流的字节数
    SizeToEnd() {
        return this.byteBuf.Size() - this.byteBuf.Pos();
    }

    // 设置当前limit限制位置, 返回之前的limit设置
    setLimit(limit) {
        return this.byteBuf.setLimit(limit);
    }

    // Read 实现 io.Reader，限制读取的字节数不超过 limit
    read(p) {
        return this.byteBuf.read(p);
    }
    
    ReadUInt(nbyte) {
        if (nbyte > 8) {
            return { result: 0n, error: new Error(`invalid nbyte: ${nbyte}`) };
        }

        // 读取 `nbyte` 字节数据到 `this.buf`
        let [n, error] = this.read(this.buf.subarray(0, nbyte));
        if (error) {
            return { result: 0n, err: error };
        }

        let v = 0n; // 用 BigInt 处理 64 位整数

        switch (nbyte) {
            case 1:
                return { result: BigInt(this.buf[0]), err: null };
            case 2:
                v = this.bigEndian
                    ? BigInt((this.buf[0] << 8) | this.buf[1])
                    : BigInt((this.buf[1] << 8) | this.buf[0]);
                return { result: v, err: null };
            case 4:
                v = this.bigEndian
                    ? BigInt(this.buf.readUInt32BE(0))
                    : BigInt(this.buf.readUInt32LE(0));
                return { result: v, err: null };
            case 8:
                v = this.bigEndian
                    ? BigInt(this.buf.readUInt64BE(0))
                    : BigInt(this.buf.readUInt64LE(0));
                return { result: v, err: null };
        }

        // 处理 3, 5, 6, 7 字节的情况
        v = 0n;
        if (this.bigEndian) {
            for (let i = 0; i < nbyte; i++) {
                v = (v << 8n) | BigInt(this.buf[i]);
            }
        } else {
            for (let i = nbyte - 1; i >= 0; i--) {
                v = (v << 8n) | BigInt(this.buf[i]);
            }
        }

        return { result: v, err: null };
    }

    ReadInt(nbyte) {
        let { result: v, err: error } = this.ReadUInt(nbyte);
        if (error) {
            return { result: 0n, err: error }; // 返回 BigInt 类型，确保大数计算正确
        }

        // 符号扩展处理
        const signBitMask = BigInt(1) << BigInt(nbyte * 8 - 1);
        if ((v & signBitMask) !== BigInt(0)) {
            v |= ~((BigInt(1) << BigInt(nbyte * 8)) - BigInt(1)); // 扩展符号位
        }

        return { result: BigInt(v), err: null };
    }

    // ReadBitsInt reads an n-bit integer in default endian byte order and returns it as a BigInt.
    ReadBitsInt(nbits) {
        if (this.bigEndian) {
            return this.readBitsIntBe(nbits); // 调用大端字节序的处理函数
        } else {
            return this.readBitsIntLe(nbits); // 调用小端字节序的处理函数
        }
    }

    // ReadBitsIntBe reads an n-bit integer in big-endian byte order and returns it as a BigInt.
    readBitsIntBe(nbits) {
        let res = 0n; // 初始化结果为 BigInt 类型
        let error = null;
        if (nbits > 64) {
            // throw new Error("can only read up to 64 bits at a time");
            error = new Error("can only read up to 64 bits at a time");
            return { result: res, err: error };
        }

        // 计算所需的位数
        const bitsNeeded = nbits - this.bitsLeft;
        this.bitsLeft = -(bitsNeeded) & 7; // 计算剩余的位数（`-bitsNeeded mod 8`）

        if (bitsNeeded > 0) {
            // 计算需要的字节数
            // let bytesNeeded = Math.floor((bitsNeeded - 1) / 8) + 1;
            let bytesNeeded = Math.ceil(bitsNeeded / 8); // `ceil(bitsNeeded / 8)`
            if (bytesNeeded > 8) {
                // throw new Error(`ReadBitsIntBe(${nbits}): more than 8 bytes requested`);
                error = new Error(`ReadBitsIntBe(${nbits}): more than 8 bytes requested`);
                return { result: res, err: error };
            }

            // 读取 `nbyte` 字节数据到 `this.buf`
            let [n, error] = this.read(this.buf.subarray(0, bytesNeeded));
            if (error) {
                return { result: n, err: error };
            }

            for (let i = 0; i < bytesNeeded; i++) {
                // res |= BigInt(this.buf[i]) << BigInt(i * 8);
                res = (res << 8n) | BigInt(this.buf[i]);

            }

            let newBits = res;
            res = (res >> BigInt(this.bitsLeft)) | (this.bits << BigInt(bitsNeeded));
            this.bits = newBits;  // will be masked at the end of the function

        } else {

            res = this.bits >> BigInt(-bitsNeeded); // 将 bitsNeeded 转为负数，进行右移操作

        }


        // 创建掩码
        let mask = (BigInt(1) << BigInt(this.bitsLeft)) - BigInt(1);
        // 对 k.bits 应用掩码
        this.bits &= mask;

        return { result: res, err: error };
    }

    // ReadBitsIntLe reads n-bit integer in little-endian byte order and returns it as BigInt.
    readBitsIntLe(nbits) {
        let res = 0n;
        let error = null;
        if (nbits > 64) {
            error = new Error("can only read up to 64 bits at a time");
            return { result: res, err: error };
        }

        let bitsNeeded = nbits - this.bitsLeft;

        if (bitsNeeded > 0) {
            let bytesNeeded = Math.ceil(bitsNeeded / 8);

            if (bytesNeeded > 8) {
                error = new Error(`ReadBitsIntBe(${nbits}): more than 8 bytes requested`);
                return { result: res, err: error };
            }

            let [n, error] = this.read(this.buf.subarray(0, bytesNeeded));
            if (error) {
                return { result: n, err: error };
            }

            for (let i = 0; i < bytesNeeded; i++) {
                res |= BigInt(this.buf[i]) << BigInt(i * 8);  // 小端字节序，按字节拼接
            }

        
            let newBits = res >> BigInt(bitsNeeded);  // 向右移动 res
            res = (res << BigInt(this.bitsLeft)) | this.bits;  // 将 k.bits 合并到 res 中
            this.bits = newBits;  // 更新 k.bits
        } else {
            res = this.bits;  // 将 k.bits 的值赋给 res
            this.bits >>= BigInt(nbits);  // 右移 k.bits，将 k.bits 的值右移 nbits 位
        }

        this.bitsLeft = (-bitsNeeded) & 7; // -bitsNeeded mod 8

        let mask = (1n << BigInt(nbits)) - 1n; // 创建一个由 nbits 个 1 组成的掩码
        res &= mask; // 将 res 与 mask 按位与，保留最低 nbits 位

        return { result: res, err: error };
    }

    // 读取 4 字节浮点数，根据大小端模式选择合适的方法
    ReadF4() {
        return this.bigEndian ? this.ReadF4be() : this.ReadF4le();
    }

     // ReadF8 reads 8 bytes in the default endian order and returns them as a float64
    ReadF8() {
        return this.bigEndian ? this.ReadF8be() : this.ReadF8le();
    }

    // 读取 4 字节并解析为大端 uint32
    ReadU4be() {
        // 读取 `nbyte` 字节数据到 `this.buf`
        let [n, error] = this.read(this.buf.subarray(0, 4));
        if (error) {
            return [0 , error];
        }

        // 直接使用 `Buffer` 的 `readUInt32BE` 读取大端 uint32
         return [this.buf.readUInt32BE(0), null];
    }

    ReadU8be() {

        let [n, error] = this.read(this.buf.subarray(0, 8));
        if (error) {
            return [0 , error];
        }
        // 直接使用 `Buffer` 的 `readUInt32BE` 读取大端 uint32
        // 使用 DataView 来读取大端 uint64
        let view = new DataView(this.buf.buffer);
        return [view.getBigUint64(0, false), null]; // false 表示大端字节序
    }

    ReadU4le() {
        // 读取 `nbyte` 字节数据到 `this.buf`
        let [n, error] = this.read(this.buf.subarray(0, 4));
        if (error) {
            return [0 , error];
        }

        // 直接使用 `Buffer` 的 `readUInt32BE` 读取小端 uint32
         return [this.buf.readUInt32LE(0), null];
    }

    ReadU8le() {
        // 读取 8 字节并转换为 uint64
        let [n, error] = this.read(this.buf.subarray(0, 8));
        if (error) {
            return [0 , error];
        }
        let view = new DataView(this.buf.buffer);
        return [view.getBigUint64(0, true), null]; // ture 表示小端字节序
        // 直接使用 `Buffer` 的 `readUInt32BE` 读取小端 uint32
    }

    ReadF4be() {
        let [vv, err] = this.ReadU4be();
        return [this.Float32FromBits(vv), err];
    }

    // ReadF8be reads 8 bytes in big-endian order and returns those as float64.
    ReadF8be() {
        let [vv, err] = this.ReadU8be();
        return [this.Float64FromBits(vv), err];
    }

    ReadF4le() {
        let [vv, err] = this.ReadU4le();
        return [this.Float32FromBits(vv), err];
    }

    ReadF8le() {
        let [vv, err] = this.ReadU8le();
        return [this.Float64FromBits(vv), err];
    }


    Float32FromBits(bits) {
        let buffer = new ArrayBuffer(4);
        new DataView(buffer).setUint32(0, bits, false); // false 表示大端序
        return new DataView(buffer).getFloat32(0, false);
    }

    Float64FromBits(bits) {
        let buffer = new ArrayBuffer(8); // 8 bytes for float64
        new DataView(buffer).setBigUint64(0, bits, false); // false 表示大端序
        return new DataView(buffer).getFloat64(0, false);

    }

    // ReadStrByteLimit 读取指定字节数并将其作为字符串返回
    readStrByteLimit(limit) {
        const buf = new Uint8Array(limit); // 创建一个 Uint8Array 缓冲区
        const [n, err] = this.read(buf);  // 将数据读取到缓冲区 `buf` 中
        const decoder = new TextDecoder('utf-8');
        const result = decoder.decode(buf.slice(0, n));
        // const result = buf.slice(0, n).toString(); // 转换为字符串
        return [result, err]; // 返回读取的字符串和错误（假设没有错误）
        
    }

}



// 测试代码：打开本地二进制文件
(async () => {
    const filePath = 'test/data/xframedata/example.zip'; // 请替换为你的二进制文件路径
    const fileStream = fs.createReadStream(filePath);
    const byteBuffer = await ByteBuffer.NewByteBufferFromReader(fileStream);
    console.log("Created ByteBuffer:", byteBuffer);

    const stream = new Stream(byteBuffer);
    console.log("Created Stream:", stream);

    // const buffer = new Uint8Array([0x41, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);  // 示例数据
    // const byteBuffer = new ByteBuffer(buffer);
    // const stream = new Stream(byteBuffer);  // 使用大端模式读取数据
    // console.log("Created ByteBuffer:", byteBuffer);

    // 测试 ReadF4 和 ReadF8
    let [f4, errF4] = stream.ReadF4();  // 读取 4 字节浮动数
    if (errF4) {
        console.error("Error reading 4-byte float:", errF4);
    } else {
        console.log("Read 4-byte float:", f4);  // 输出 float32 值
    }

    console.log("Created Stream:", stream);

    let [f8, errF8] = stream.ReadF8();  // 读取 8 字节浮动数
    if (errF8) {
        console.error("Error reading 8-byte float:", errF8);
    } else {
        console.log("Read 8-byte float:", f8);  // 输出 float64 值
    }

    console.log("Created Stream:", stream);

    // 测试读取大端 uint32 和 uint64
    // let [u4, errU4] = stream.ReadU4be();
    // if (errU4) {
    //     console.error("Error reading 4-byte uint:", errU4);
    // } else {
    //     console.log("Read 4-byte uint:", u4);
    // }

    // console.log("Created Stream:", stream);

    // let [u8, errU8] = stream.ReadU8be();
    // if (errU8) {
    //     console.error("Error reading 8-byte uint:", errU8);
    // } else {
    //     console.log("Read 8-byte uint:", u8);
    // }
})();



// 只导出 Stream 类
module.exports = Stream; // CommonJS 方式导出