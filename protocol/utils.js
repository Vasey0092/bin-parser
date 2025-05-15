function convertToInt64(v) {
    // 使用 BigInt 来处理 64 位整数
    if (typeof v === "number") {
        // 处理普通的数字类型，JavaScript 中是浮动精度数字
        return BigInt(Math.floor(v)); // 转换为整数部分
    }
    
    if (typeof v === "bigint") {
        // 如果已经是 BigInt 类型，直接返回
        return v;
    }
    
    throw new Error(`Unsupported type: ${typeof v}`);
}

function mixedInterfacesToBytes(datas) {
    let result = [];
    
    for (let item of datas) {
        if (typeof item === 'string') {
            // 字符串，转换为字节数组
            result.push(...new TextEncoder().encode(item));
        } else if (typeof item === 'number') {
            // 数字，转换为字节
            result.push(item & 0xFF);  // 将数字限制为 0-255，模拟 byte 的行为
        } else {
            return { error: "unsupported data type" };
        }
    }

    return { result };
}

// // 测试数据
// const testData = [
//     "hello",        // 字符串
//     65,             // 数字 (ASCII值：A)
//     "world",        // 字符串
//     255,            // 数字 (最大字节值)
//     100             // 数字
// ];

// // 调用函数
// const { result, error } = mixedInterfacesToBytes(testData);

// if (error) {
//     console.error(error);
// } else {
//     // 输出结果
//     console.log("字节数组结果:", result);
// }


// // 直接测试
// const testCases = [
//     { input: 42, expected: 42n },
//     { input: 1234567890123, expected: 1234567890123n },
//     { input: -100, expected: -100n },
//     { input: 32000, expected: 32000n },
//     { input: 127, expected: 127n },
//     { input: 99.99, expected: 99n },
//     { input: 42.42, expected: 42n },
//     { input: BigInt("9223372036854775807"), expected: 9223372036854775807n }, // 测试大整数
//     { input: "hello", expected: "error" }, // 无效类型
// ];

// // 运行测试
// testCases.forEach(({ input, expected }, index) => {
//     try {
//         const result = convertToInt64(input);
//         console.log(`Test ${index + 1}: convertToInt64(${input}) → ${result}`);
//         console.assert(result === expected, `❌ Failed: Expected ${expected}, got ${result}`);
//     } catch (error) {
//         if (expected === "error") {
//             console.log(`Test ${index + 1}: convertToInt64(${input}) → Error (as expected)`);
//         } else {
//             console.error(`❌ Test ${index + 1} failed: ${error.message}`);
//         }
//     }
// });

module.exports = { 
    convertToInt64 ,
    mixedInterfacesToBytes
};