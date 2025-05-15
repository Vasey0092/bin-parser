const SyntaxConfig = require("../../protocol/SyntaxConfig.js");
const Parser = require("../../protocol/prase.js");
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const start = performance.now();

const JsonLevelOriginal = 0x00000001;
const JsonLevelEngineer = 0x00000002;
const JsonLevelSimple = 0x00000002;
const JsonLevelDetail = 0x00000003;
const JsonLevelCustom = 0x00000004;   

// 测试代码
async function testParser() {
    const yamlpath = "test/protocol/zip.yaml";
    const config = new SyntaxConfig();
    const finalConfig = await config.LoadConfigFromFile(yamlpath);
    const parser = new Parser(finalConfig);
    const filePath = 'test/data/xframedata/example.zip'; // 请替换为你的二进制文件路径
    
    // 确保文件存在
    if (!fs.existsSync(filePath)) {
      console.error("File not found:", filePath);
      return;
    }
  
    const fileStream = fs.createReadStream(filePath);
  
    try {
        // 使用 ParseFromReader 处理文件流
        const result = await parser.ParseFromReader(fileStream);
        let {result: res, err: err} = result; 
        // 打印结果
        res.dump();
        dataSimpleJson = res.ToJson(JsonLevelSimple);
        const parsedData = JSON.parse(dataSimpleJson); // 解析为 JS 对象
        console.log(parsedData);
        // 保存为本地 JSON 文件
        const outputPath = path.join(__dirname, 'parsed_output.json');
        fs.writeFileSync(outputPath, JSON.stringify(parsedData, null, 2), 'utf-8');
      
        console.log('✅ JSON 数据已成功保存到：', outputPath);

    } catch (error) {
      console.error("Error during parsing:", error);
    }
}

testParser();
const end = performance.now();
console.log(`⏱️ 精准运行时间: ${(end - start).toFixed(3)} ms`);
module.exports = { 
  testParser
};



