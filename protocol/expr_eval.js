const { Parser } = require('expr-eval');
const util = require('util');
const parser = new Parser();

// // 添加新函数
// parser.functions.customAddFunction = function(arg1, arg2) {
//   return arg1 + arg2;
// };

// 移除阶乘函数
// delete parser.functions.fac;

parser.functions.Sprintf = function(format, ...args) {
    let i = 0;
    return format.replace(/%(\d*)X|%d/g, (match, p1) => {
        let value = args[i++];
        if (match.includes('X')) {
            return value.toString(16).toUpperCase().padStart(p1, '0');
        }
        return value;
    });
}

parser.functions.GroundTime = function() {
    // return new Date().toISOString(); // 返回标准 ISO 格式时间，如 "2025-03-25T12:34:56.789Z"
    const now = new Date();
    return now.getFullYear() + "-" + 
           String(now.getMonth() + 1).padStart(2, '0') + "-" + 
           String(now.getDate()).padStart(2, '0') + " " + 
           String(now.getHours()).padStart(2, '0') + ":" + 
           String(now.getMinutes()).padStart(2, '0') + ":" + 
           String(now.getSeconds()).padStart(2, '0');
}

parser.functions.SatTime = function(week, second) {
    // 基准时间：2017-01-01 00:00:00（北京时间 UTC+8）
    const baseTimestamp = 1483200000 + 8 * 3600; // 转换成 UTC 时间戳（秒）
    
    // 计算新的时间戳
    const timestamp = (baseTimestamp + week * 604800 + second) * 1000; // 转为毫秒级时间戳
    
    // 创建 Date 对象
    const date = new Date(timestamp);

    // 格式化时间
    return date.getFullYear() + "-" + 
           String(date.getMonth() + 1).padStart(2, '0') + "-" + 
           String(date.getDate()).padStart(2, '0') + " " + 
           String(date.getHours()).padStart(2, '0') + ":" + 
           String(date.getMinutes()).padStart(2, '0') + ":" + 
           String(date.getSeconds()).padStart(2, '0');
}


module.exports = parser;

// console.log(parser.evaluate('Sprintf("%d_%d_X_%04X", 9, 7, 422)')); // true
// console.log(parser.evaluate('GroundTime()')); // true
// console.log(parser.evaluate('SatTime(0,1453)')); // true


// parser.evaluate('fac(3)'); // 这将会失败