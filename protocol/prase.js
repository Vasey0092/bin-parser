const Stream = require("./stream.js");
const { ProtocolResult, ProtocolValue, ProtocolComposite } = require("./ProtocolResult.js");
const SyntaxConfig = require("./SyntaxConfig.js");
const expr_eval = require('./expr_eval.js'); // 变量名可以是 myParser
const { convertToInt64 } = require('./utils'); // 引入 utils.js
const fs = require('fs');

// 定义标志常量
const RepeatClassNull = 0x00000000;
const RepeatClassMask = 0xFFFF0000;
const RepeatClassCount = 0x00010000;
const RepeatClassUntil = 0x00020000;
const RepeatClassUntilCurr = 0x00020001;
const RepeatClassUntilNext = 0x00020002;

const FieldSetEndianBit = 0x80000000;

const FieldTypeClassMask = 0x0000FF00;
const FieldTypeClassNull = 0x00000000;
const FieldTypeClassInt = 0x00000100;
const FieldTypeClassFloat = 0x00000200;
const FieldTypeClassString = 0x00000300;
const FieldTypeClassBytes = 0x00000400;
const FieldTypeClassExpr = 0x00000500;
const FieldTypeClassStruct = 0x00000600;
const FieldTypeClassSwitchOn = 0x00000700;

const FieldSubTypeMask = 0x000000FF;
const FieldSubTypeInt = 0x00000001;
const FieldSubTypeUInt = 0x00000002;
const FieldSubTypeBit = 0x00000003;
const FieldSubTypeFloat32 = 0x00000004;
const FieldSubTypeFloat64 = 0x00000005;

const FieldTypeClassComboMask = 0x00FF0000;
const FieldTypeClassComboArray = 0x00010000;

class ParseExprEnv {
  constructor(pc) {
    this.pc = pc; // 解析上下文
  }
}


class Parser {
  constructor(config) {
    this.config = config;
  }

  NewParser() {
    return this.config;
  }
 
  async ParseFromReader(reader) {
    try {
      const stream = await Stream.NewStreamFromReader(reader);
      return this.ParseFromStream(stream);
    } catch (error) {
      console.error("Error in ParseFromReader:", error);
      return null;
    }
  }

  // 在 Parser 类中添加 NewParseContext 方法
  NewParseContext(stream) {
    const context = new ParseContext(this.config);
    context.exprEnv.pc = context; // 绑定解析上下文
    context.result = context.result.NewProtocolResult(context.config, stream); // 创建 result
    context.root = context.result.root; // 设定 root

    return context; // 返回解析上下文
  }

    // 解析报文
  ParseFromStream(stream) {
      // 记录旧的字节序（true 表示大端，false 表示小端）
      const oldEndian = stream.setDefaultEndian(this.config.IsDefaultBigEndian());
  
      try {
          // 创建解析上下文
          const context = this.NewParseContext(stream);
          // 执行解析
          context.parseSyntaxType(stream, context.config.root, context.root, null);
          stream.setDefaultEndian(oldEndian);
          return {result: context.result, err: null };
      } catch (error) {
          // 捕获错误并返回
          stream.setDefaultEndian(oldEndian);
          console.log(error);
          return { result: null, err:error };
      } finally {
          // 恢复原来的字节序
          stream.setDefaultEndian(oldEndian);
      }
  }

}

class ParseContext {
  constructor(config) {
    this.config = config;         // 配置对象
    this.exprEnv = new ParseExprEnv(); // 表达式环境
    this.result = new ProtocolResult(config, null); // stream 设为 null
    this.stream = null;           // 数据流，默认 null
    this.root = this.result.root; // 解析树的根节点
    this.current = null;          // 当前解析节点
    this.parent = null;           // 父节点
  }

 // 添加临时的 ProtocolValue 映射，用于计算表达式
  addTempValueMap(valueID, pv) {
    this.current.addTempValueMap(valueID, pv);
  //   if (this.current && typeof this.current.addTempValueMap === "function") {
  //     this.current.addTempValueMap(valueID, pv);
  // } else {
  //     console.warn(`addTempValueMap: 无法在 current 上添加 ${valueID}`);
  // }
  }

  // 删除临时的 ProtocolValue 映射，用于计算表达式
  removeTempValueMap(valueID) {
    this.current.removeTempValueMap(valueID);
  //   if (this.current && typeof this.current.removeTempValueMap === "function") {
  //     this.current.removeTempValueMap(valueID);
  // } else {
  //     console.warn(`removeTempValueMap: 无法删除;
  // }
  }

// 替换表达式中的标识符为实际数值
  getValueByIdentifier(valueID) {
    let curr = this.current;
    let first = true;

    // 使用 .split() 按 '.' 分割字符串
    const idArr = valueID.split(".");

    for (let id of idArr) {
        if (id === "root") {
            curr = this.root;
            first = false;
            continue;
        }
        if (!curr) {
            throw new Error(`Invalid identifier for: ${valueID}`);
        }
        if (id === "current") {
            first = false;
            continue;
        }
        if (id === "parent") {
            curr = curr.parent;
            first = false;
            continue;
        }
        let [nextval, ok] = curr.getValueByValueID(id);
        if (!ok && first) {
            curr = this.root;
            [nextval, ok] = curr.getValueByValueID(id);
        }
        if (ok) {
            curr = nextval;
        } else {
            throw new Error(`Invalid identifier for: ${valueID}`);
        }
        first = false;
    }
    return [curr, null];
 }

  // 获取字段大小的方法
  getFieldSize(stream, field) {
    if (field.sizeDone == null) {
        return [0, new ProtocolError('ProtocolErrorSizeNull', `[Field(${field.ID})]: size is not defined for string field`)];
    }

    if (field.sizeDone.IsSizeFixed()) {
        return [field.sizeDone.sizeFixed, null];
    }

    if (field.sizeDone.IsSizeEOSOnly()) {
        return [stream.SizeToEnd(), null];
    }

    if (field.sizeDone.IsSizeExprRelated()) {
        let sizeExpr = field.sizeDone.sizeExpr;
        // console.log(sizeExpr);
        if (field.sizeDone.IsSizeEOSRelated()) {
            const sizeEOS = stream.SizeToEnd();
            // 如果size包含eos, 则需要替换为实际大小
            const eosPattern = /\beos\b/g;
            sizeExpr = sizeExpr.replace(eosPattern, `${sizeEOS}`);
        }
        const {result: result, error: perr} = this.evaluateExpression(sizeExpr);
        // console.log(result);
        if (perr) {
            return [0, perr];
        }

        const resultInt = convertToInt64(result);
        if (isNaN(Number(resultInt))) {
            return [0, new ProtocolError('ProtocolErrorSwitchError', `[Field(${field.id})]: Invalid size: ${result}`)];
        }

        const size = resultInt;
        if (size < 0n) {
            return [0, new ProtocolError('ProtocolErrorSizeError', `[Field(${field.id})]: Invalid size: ${size}`)];
        }

        return [Number(size), null];
    }

    return [0, new ProtocolError('ProtocolErrorSizeError', `[Field(${field.id})]: Unknown size type`)];
  }
// 解析字段序列
  parseSyntaxType(stream, syntaxType, current, parent) {
    // 保存旧的 current 和 parent
    const oldCurrent = this.current;
    const oldParent = this.parent;
    // 更新 current 和 parent
    this.current = current;
    this.parent = parent;
    // console.log("seq",syntaxType.seq);
    try {
        // 遍历 syntaxType 中的字段
        for (const field of syntaxType.seq) {
            // 创建新值
            const pv = this.current.newValue(field, field.id);
            // 解析字段
            const perr = this.parseField(stream, field, pv);
            if (perr) {
                return perr; // 解析失败，返回错误
            }
        }
        // 更新当前对象的确定状态
        this.current.updateDeterminedFromChild();
        return null; // 成功返回 null

    } finally {
        // 确保在方法结束时恢复原值（类似 Go 的 defer）
        this.current = oldCurrent;
        this.parent = oldParent;
    }

  }

  parseField(stream, field, value) {
    value.setPosBegin(stream.getPos()); // 记录起始位置

    try {
        // 是否是数组类型
        if (field.GetFieldTypeClassCombo() === FieldTypeClassComboArray && !this.current.IsValueClassArray()) {
            const perr = this.parseArrayField(stream, field, value);
            if (perr) return perr;
            return null;
        }
        // 解析普通数据或数组元素
        switch (field.GetFieldTypeClass()) {
            case FieldTypeClassInt:
            case FieldTypeClassFloat:
            case FieldTypeClassString:
            case FieldTypeClassBytes:
            case FieldTypeClassExpr:
                const perr1 = this.parsePrimitiveField(stream, field, value);
                if (perr1) return perr1;
                break;
            case FieldTypeClassStruct:
                const perr2 = this.parseStructField(stream, field, value);
                if (perr2) return perr2;
                break;
            case FieldTypeClassSwitchOn:
                const perr3 = this.parseSwitchOnField(stream, field, value);
                if (perr3) return perr3;
                break;
            case FieldTypeClassNull:
                return new ProtocolError(`Invalid field type: ${field.id}`);
            case FieldTypeClassComboArray:
                return new ProtocolError(`Array field can't reach here: ${field.id}`);
        }
      return null;
    } finally {
        value.setPosEnd(stream.getPos()); // 记录结束位置
    }

  }

// 解析字段
  parsePrimitiveField(stream, field, value) {
    let oldEndian;
    let shouldRestore = false; // 添加标记变量
    if (field.IsFieldTypeSetEndian()) {
        oldEndian = stream.setDefaultEndian(field.IsFieldTypeBigEndian());
        shouldRestore = true; // 确保 finally 执行恢复操作
    }

    try {
        switch (field.GetFieldTypeClass()) {
            case FieldTypeClassInt:
                switch (field.GetFieldSubType()) {
                    case FieldSubTypeInt:
                        var { result: v, err: error } = stream.ReadInt(field.GetFieldTypeInternalCount());
                        if (error) return ProtocolError.wrapf(ProtocolError.IOError, error, `[Field(${field.id})]: IO error`);
                        value.SetValueInt(v);
                        break;
                    case FieldSubTypeUInt:
                        var { result: v, err: error } = stream.ReadUInt(field.GetFieldTypeInternalCount());
                        if (error) return ProtocolError.wrapf(ProtocolError.IOError, error, `[Field(${field.id})]: IO error`);
                        value.SetValueUInt(v);
                        break;
                    case FieldSubTypeBit:
                        var { result: v, err: error } = stream.ReadBitsInt(field.GetFieldTypeInternalCount());
                        if (error) return ProtocolError.wrapf(ProtocolError.IOError, error, `[Field(${field.id})]: IO error`);
                        value.SetValueUInt(v);
                        break;
                }
                break;
            case FieldTypeClassFloat:
                switch (field.GetFieldSubType()) {
                    case FieldSubTypeFloat32:
                        var [v, err] = stream.ReadF4();
                        if (err) return ProtocolError.wrapf(ProtocolError.IOError, err, `[Field(${field.id})]: IO error`);
                        value.SetValueFloat32(v);
                        break;
                    case FieldSubTypeFloat64:
                        var [v, err] = stream.ReadF8();
                        if (err) return ProtocolError.wrapf(ProtocolError.IOError, err, `[Field(${field.id})]: IO error`);
                        value.SetValueFloat64(v);
                        break;
                }
                break;
            case FieldTypeClassString:
                var [size, perr] = this.getFieldSize(stream, field);
                if (perr) return perr;
                var [v, err] = stream.readStrByteLimit(size);
                // console.log(v)
                if (err) return ProtocolError.wrapf(ProtocolError.IOError, err, `[Field(${field.id})]: IO error`);
                value.SetValueString(v);
                break;
            case FieldTypeClassBytes:
                var [size, perr] = this.getFieldSize(stream, field);
                if(size===0){
                  var buffer = new Uint8Array(size);
                  value.SetValueBytes(buffer);
                  break;
                }
                if (perr) return perr;
                var buffer = new Uint8Array(size);
                var [ n, err ]= stream.read(buffer);
                if (err) return ProtocolError.wrapf(ProtocolError.IOError, err, `[Field(${field.id})]: IO error`);
                if (n !== size) return ProtocolError.format(ProtocolError.SizeMismatch, `[Field(${field.id})]: Data read: ${n}, not satisfying requested size: ${size}`);
                value.SetValueBytes(buffer);
                break;
            case FieldTypeClassExpr:
                value.SetValueExpr();
                break;
            default:
                return ProtocolError.format(ProtocolError.ValueNotPrimitive, `[Field(${field.id})]: type ${field.typeDone.fieldType} is not primitive`);
        }

        if (field.contentDone) {
            var [equal, perr] = value.EqualContent(field.contentDone);
            if (perr) return perr;
            if (!equal) return ProtocolError.format(ProtocolError.ContentsMismatch, `[Field(${field.id})]: Contents is not equal to: ${field.contents}`);
        }

        if (field.enumDone) {
            var [intValue, ok] = value.GetValueInt();

            if (ok) {
                // if (field.enumDone[intValue] !== undefined) {
                //     value.setShowValue(field.enumDone[intValue]);
                // }
                // console.log("intvalue",intValue);
                if (field.enumDone.has(intValue)) {
                  const showValue = field.enumDone.get(intValue);
                  value.SetShowValue(showValue);
              }
            }
        } else if (field.expr) {
            var { result: result, error: perr } = this.evaluateExpression(field.expr);
            if (perr) return perr;
            value.SetShowValue(String(result));
        } else {
            value.SetShowValueDefault();
        }

        value.SetState("ok");
        value.SetDetermined(true);
        return null;
    } finally {
          if(shouldRestore){
          stream.setDefaultEndian(oldEndian);
          }
    }
  }

  parseStructFieldForType(stream, fieldType, field, value) {
    let subSyntaxType= this.config.types[fieldType];
    if (!subSyntaxType) {
        throw new Error(`[Field(${field.id})]: Invalid field type: ${fieldType}`);
    }
    value.SetValueStruct(subSyntaxType);
    // 如果 Size 不为空，先读出数据再处理
    if (field.size) {
        let [size, perr] = this.getFieldSize(stream, field);
        if (perr) {
            return perr; // 返回错误
        }

        // 设定读取数据的范围
        let curPos = stream.getPos();
        let endPos = curPos + size;
        let oldLimit = stream.setLimit(endPos);

        try {
            return this.parseSyntaxType(stream, subSyntaxType, value, this.current);
        } finally {
            stream.setLimit(oldLimit);
            stream.seekPos(endPos);
        }
    }

    return this.parseSyntaxType(stream, subSyntaxType, value, this.current);
}

// 解析结构体字段
  parseStructField(stream, field, value) {
    let fieldType = field.GetFieldType(); // 获取字段类型
    return this.parseStructFieldForType(stream, fieldType, field, value);
}

  parseSwitchOnField(stream, field, value) {
    let switchOn = field.GetFieldTypeSwitchOn();
    let valueInt;
    try {
        let {result: result ,error: err } = this.evaluateExpression(switchOn.switchExpr);
        valueInt = convertToInt64(result);
        if (err) {
          return err;
        }
    } catch (err) {
        throw new ProtocolError(`Invalid switch on result: ${result} for field(${field.id})`, "ProtocolErrorSwitchError", err);
    }

    if (switchOn.caseArr && switchOn.caseArr.has(Number(valueInt))) {
        let strSubType = switchOn.caseArr.get(Number(valueInt));
        return this.parseStructFieldForType(stream, strSubType, field, value);
    }

    if (switchOn.caseArrConfig && switchOn.caseArrConfig.has(Number(valueInt))) {
        let subConfig = switchOn.caseArrConfig.get(Number(valueInt));
        let subParser = new Parser(subConfig);
        try {
            let {result: result, err: error} = subParser.ParseFromStream(stream);
            value.setValueFromResult(this.current, result);
            return null;
        } catch (err) {
            throw new ProtocolError(`Parse switch on value ${valueInt} failed for field(${field.id})`, "ProtocolErrorSubProtocolError", err);
        }
    }

    if (switchOn.caseDefault) {
        return this.parseStructFieldForType(stream, switchOn.caseDefault, field, value);
    }

    if (switchOn.caseDefaultConfig) {
        let subParser = new Parser(switchOn.caseDefaultConfig);
        try {
            let {result: result, err: error} = subParser.ParseFromStream(stream);
            value.setValueFromResult(this.current, result);
            return null;
        } catch (err) {
            throw new ProtocolError(`Parse switch on default failed for field(${field.id})`, "ProtocolErrorSubProtocolError", err);
        }
    }

    throw new ProtocolError(`Unmatched switch case ${valueInt} for field(${field.id})`, "ProtocolErrorSwitchError");
  }

// 解析数组元素
  parseArrayField(stream, field, value) {
    switch (field.repeatDone.GetClass()) {
        case RepeatClassCount:
            let count = field.repeatDone.countDone;

            if (count === 0) {
              const {result: exprRes ,error: evalError } = this.evaluateExpression(field.repeatDone.countExpr);
                if (evalError) {
                    return evalError; // 返回错误
                }

                const resultInt = convertToInt64(exprRes);
                if (isNaN(resultInt)) {
                    return new ProtocolError(ProtocolErrorSwitchError, `[Field(${field.id})]: Invalid count for repeat: ${result}`);
                }

                count = parseInt(resultInt, 10);
                if (count < 0) {
                    return new ProtocolError(ProtocolErrorSizeError, `[Field(${field.id})]: Invalid count for repeat: ${count}`);
                }
            }

            if (count > 0) {
                return this.parseArrayFieldCount(stream, field, value, count);
            }
            return null;

        case RepeatClassUntil:
            if (field.repeatDone.IsUntilCurr()) {
                return this.parseArrayFieldUntilCurr(stream, field, value, field.repeatDone.untilExpr);
            } else if (field.repeatDone.IsUntilNext()) {
                return this.parseArrayFieldUntilNext(stream, field, value, field.repeatDone.untilExpr, field.repeatDone.untilNextField);
            }
            break;

        default:
            return new ProtocolError(ProtocolErrorRepeatClass, `[Field(${field.id})]: Unknown repeat class for: ${field.Repeat}`);
    }

    return null;
  }
// 解析数组元素count个
  parseArrayFieldCount(stream, field, value, count) {
    value.setValueArray();

    const oldCurrent = this.current;
    const oldParent = this.parent;
    this.current = value;
    this.parent = oldCurrent;

    try {
        for (let i = 0; i < count; i++) {
            let pv = this.current.newValue(field, i.toString());
            let perr = this.parseField(stream, field, pv);
            if (perr) {
                return perr;
            }
        }
        value.updateDeterminedFromChild();
    } finally {
        this.current = oldCurrent;
        this.parent = oldParent;
    }

    return null;
  }

// 解析数组元素until含curr的untilExpr为true
  parseArrayFieldUntilCurr(stream, field, value, untilExpr) {
    value.setValueArray();

    let oldCurrent = this.current;
    let oldParent = this.parent;
    this.current = value;
    this.parent = oldCurrent;

    try {
        let isEnd = false;

        for (let i = 0; !isEnd; i++) {
            let pv = this.current.newValue(field, i.toString());
            let perr = this.parseField(stream, field, pv);
            if (perr) return perr;

            this.addTempValueMap("curr", pv);
            const {result: exprRes ,error: evalError } = this.evaluateExpression(untilExpr);
            if (evalError instanceof Error) return evalError;

            isEnd = Boolean(exprRes);
        }

        value.updateDeterminedFromChild();
    } finally {
        this.removeTempValueMap("curr");
        this.current = oldCurrent;
        this.parent = oldParent;
    }
    return null;
  }

// 解析数组元素until含next的untilExpr为true
  parseArrayFieldUntilNext(stream, field, value, untilExpr, nextField) {
    value.setValueArray();

    const oldCurrent = this.current;
    const oldParent = this.parent;
    this.current = value;
    this.parent = oldCurrent;

    let isEnd = false;

    try {
        // 使用 for 循环代替 while 循环
        for (let i = 0; !isEnd; i++) {
            const pos = stream.getPos(); // 保存当前位置
            const nextpv = ProtocolValue.NewProtocolValue(null, nextField, "next"); // 临时 ProtocolValue
            
            const perr = this.parseField(stream, nextField, nextpv);
            stream.seekPos(pos); // 恢复当前位置

            if (perr) {
                return perr;
            }

            this.addTempValueMap("next", nextpv);
            const {result: exprRes, error: evalError} = this.evaluateExpression(untilExpr);
            if (evalError) {
                return evalError;
            }

            isEnd = Boolean(exprRes);
            if (isEnd) {
                break;
            }

            const pv = this.current.newValue(field, i.toString());
            const fieldErr = this.parseField(stream, field, pv);
            if (fieldErr) {
                return fieldErr;
            }
        }

        value.updateDeterminedFromChild();
    } finally {
        // 确保恢复上下文和清理临时值
        this.current = oldCurrent;
        this.parent = oldParent;
        this.removeTempValueMap("next");
    }

    return null;
}

  // 替换表达式中的标识符为实际数值
  replaceIdentifiers(code) {
    // 正则表达式，用于匹配双引号中的内容，包括转义双引号，或者非双引号的部分
    const reQuote = /"(?:\\.|[^"\\])*"|[^"\\]+/g;

    // 正则表达式，匹配多层次标识符（包括类似 header.len, parent.data.value 形式的多层次标识符）
    const reIdentifier = /\b[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*\b/g;

    // 用于构建最终结果的字符串
    let result = '';

    // 使用正则表达式将代码分割为双引号中的内容和非双引号的内容
    let matchesQuote = code.match(reQuote);

    if (matchesQuote) {
      matchesQuote.forEach(part => {
        if (part.startsWith('"')) {
          // 如果这部分是双引号中的内容，保持不变
          result += part;
        } else {
          // 如果是非双引号的内容，替换标识符
          let codepart = part;
          let matchesIdentifier = [...codepart.matchAll(reIdentifier)];
          let offset = 0;
          matchesIdentifier.forEach(match => {
            let start = match.index + offset;
            let end = match.index + match[0].length + offset;
            let identifier = codepart.slice(start, end);
            // 检查标识符后是否有括号 '(', 如果有, 则是函数调用, 忽略
            if (end < codepart.length && codepart[end] === '(') {
              return;
            }

            const [pv, err] = this.getValueByIdentifier(identifier);
            if (err === null &&pv !== null) {
              // 将标识符替换为数值
              let valExpr = pv.GetValueExpr();

              codepart = codepart.slice(0, start) + valExpr + codepart.slice(end);

              // 更新偏移量：替换后的长度差异
              offset += valExpr.length - identifier.length;
            } else {
              console.log(`Error replacing identifier: ${identifier}`);
            }
          });
          result += codepart;
        }
      });
    }

    return result;
  }

  // 解析并计算表达式
  evaluateExpression(code) {
    const newcode = this.replaceIdentifiers(code);
    // console.log(newcode)
    // 尝试直接解析为整数
    try {
      // 尝试解析为 BigInt
      let intResult = BigInt(newcode);

      return { result: intResult, error: null };
    } catch (e) {
        // 不能转换为 BigInt，继续用 eval 计算
    }

    // 如果不能直接解析为整数，使用 JavaScript 的 eval 来计算表达式
    try {
      // 使用 eval 函数来求值，eval 能执行有效的 JavaScript 代码
      // const result = eval(newcode);
      let result = expr_eval.evaluate(newcode);

      return { result: result, error: null };
    } catch (err) {
      return {
        result: null,
        error: new Error(`Invalid expression for evaluation: ${code}`),
      };
    }
  }

}

module.exports = Parser; // CommonJS 方式导出


// // 测试代码
// async function testParser() {
//   const yamlpath = "D:/AAAbishe/protocoljs/test/protocol/ziptest.yaml";
//   const config = new SyntaxConfig();
//   const finalConfig = await config.LoadConfigFromFile(yamlpath);
//   const parser = new Parser(finalConfig);
//   const filePath = 'test/data/xframedata/example.zip'; // 请替换为你的二进制文件路径
  
//   // 确保文件存在
//   if (!fs.existsSync(filePath)) {
//     console.error("File not found:", filePath);
//     return;
//   }

//   const fileStream = fs.createReadStream(filePath);

//   try {
//     // 使用 ParseFromReader 处理文件流
//     const result = await parser.ParseFromReader(fileStream);
//     let {result: res, err: err} = result; 

//     res.dump();

//   } catch (error) {
//     console.error("Error during parsing:", error);
//   }
// }


// testParser();
