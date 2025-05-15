class ProtocolResult {
    constructor(config, stream) {
      this.id = config.meta.id;       // 报文 ID
      this.name = config.meta.name;   // 报文名字
      this.payload = config.meta.payload; // 报文 payload ID
      this.stream = stream;           // 数据流
      this.root = ProtocolValue.NewProtocolValueStruct(null, config.root, "root"); // 根结构
    }
  
    // 静态方法用于创建 ProtocolResult 实例
    NewProtocolResult(config, stream) {
      return new ProtocolResult(config, stream);
    }

    dump() {
        console.log(`=====packet: ${this.id}(${this.name}) ======`);
        if (this.root && typeof this.root.dump === "function") {
          this.root.dump(); // 确保 root 有 dump 方法
        }
        console.log("================================================");
    }

    ToJson(jsonLevel) {
        try {
            // 确保 root 对象有 `ToJson` 方法
            if (typeof this.root.ToJson !== "function") {
                throw new Error("root does not have a ToJson method");
            }

            const jsonRoot = this.root.ToJson(jsonLevel);
            // 自动还原嵌套 JSON 字符串
            const data = deepJsonParse(jsonRoot);

            // 构造最终结构
            const result = {
                id: this.id,
                name: this.name,
                data: data,
            };

            return JSON.stringify(result);
        } catch (error) {
            console.error("ToJson error:", error);
            throw new Error('ToJson error: ' + err.message);
        }
    }
  
}

/**
 * 递归解析一个对象中所有嵌套的 JSON 字符串字段
 * @param {any} obj - 可能包含嵌套 JSON 字符串的对象
 * @returns {any} - 解析后的对象
 */
function deepJsonParse(obj) {
    if (typeof obj === "string") {
      try {
        const parsed = JSON.parse(obj);
        return deepJsonParse(parsed); // 递归继续解析
      } catch (e) {
        return obj; // 不是 JSON 字符串则原样返回
      }
    } else if (Array.isArray(obj)) {
      return obj.map(deepJsonParse);
    } else if (typeof obj === "object" && obj !== null) {
      const newObj = {};
      for (const key in obj) {
        newObj[key] = deepJsonParse(obj[key]);
      }
      return newObj;
    } else {
      return obj;
    }
  }

  
const ValueTypeClassMask      = 0x0FFF0000;
const ValueTypeClassPrimitive = 0x000F0000;
const ValueTypeClassInt       = 0x00010000;
const ValueTypeClassFloat     = 0x00020000;
const ValueTypeClassString    = 0x00040000;
const ValueTypeClassBytes     = 0x00080000;
const ValueTypeClassComposite = 0x00F00000;
const ValueTypeClassStruct    = 0x00100000;
const ValueTypeClassArray     = 0x00200000;
const ValueTypeClassExpr      = 0x01000000;
const ValueTypeNull           = 0x00000000;
const ValueTypeInt            = 0x00010001;
const ValueTypeUInt           = 0x00010002;
const ValueTypeFloat32        = 0x00020001;
const ValueTypeFloat64        = 0x00020002;
const ValueTypeString         = 0x00040000;
const ValueTypeBytes          = 0x00080000;
const ValueTypeStruct         = 0x00100000;
const ValueTypeArray          = 0x00200000;
const ValueTypeExpr           = 0x01000000;


const JsonLevelOriginal = 0x00000001;
const JsonLevelEngineer = 0x00000002;
const JsonLevelSimple = 0x00000002;
const JsonLevelDetail = 0x00000003;
const JsonLevelCustom = 0x00000004;   

class ProtocolValue {
    constructor(parent = null, stxField = null, valueID = "") {
    this.stxField = stxField; // 语法字段
    this.parent = parent;     // 父节点
    this.valueID = valueID;   // 值 ID
    this.valueType = ValueTypeNull >>> 0; // 默认值类型
    this.value = null;        // 存储的值
    this.showvalue = "";      // 显示值
    this.state = "";          // 状态
    this.determined = false;  // 是否已确定
    this.posBegin = 0;        // 位置起点
    this.posEnd = 0;          // 位置终点
    }

    // 用于创建一般的 ProtocolValue 实例
    static NewProtocolValue(parent, field, valueID) {
        return new ProtocolValue(parent, field, valueID);
    }

    // 用于 root 的 ProtocolComposite 的 Value 构造
    static NewProtocolValueStruct(parent, stxType, valueID) {
        const cv = new ProtocolValue(parent, null, valueID);
        cv.valueType = ValueTypeStruct;
        cv.value = new ProtocolComposite(cv, stxType, false); // 需要定义 ProtocolComposite 类
        return cv;
    }

    dump() {
        this.dumpValue("");
    }

    dumpValue(indent) {
        if (this.stxField) {
          if (this.stxField.name) {
            process.stdout.write(
                  `${indent}${this.valueID}[${this.stxField.name}][${this.posBegin.toString().padStart(4, "0")}-${this.posEnd.toString().padStart(4, "0")}][determine: ${this.determined}]:`
                );
            // console.log(
            //   `${indent}${this.valueID}[${this.stxField.name}][${this.posBegin.toString().padStart(4, "0")}-${this.posEnd.toString().padStart(4, "0")}][determine: ${this.determined}]:`
            // );
          } else {
            process.stdout.write(
                `${indent}${this.valueID}[${this.posBegin.toString().padStart(4, "0")}-${this.posEnd.toString().padStart(4, "0")}][determine: ${this.determined}]:`
              );
            // console.log(
            //   `${indent}${this.valueID}[${this.posBegin.toString().padStart(4, "0")}-${this.posEnd.toString().padStart(4, "0")}][determine: ${this.determined}]:`
            // );
          }
        }
        // console.log("valueid",this.valueID);
        if (this.valueID === 'info_content') {
            debugger;  // 当条件满足时，代码会在这一行暂停
        }
        // console.log("showvalue",this.showvalue)
        // console.log(this.getValueClass());
        switch (this.getValueClass()) {
          case ValueTypeClassInt:
          case ValueTypeClassFloat:
          case ValueTypeClassString:
            // console.log(this.showvalue ? `${this.showvalue}(${this.value})` : this.value);
            process.stdout.write(this.showvalue ? `${this.showvalue}(${this.value})` : this.value.toString());
            process.stdout.write("\n");
            break;
          case ValueTypeClassExpr:
            process.stdout.write(this.showvalue);
            process.stdout.write("\n");
            // console.log(this.showvalue);
            break;
          case ValueTypeClassBytes:
            const byteArray = new Uint8Array(this.value);
            if (byteArray instanceof Uint8Array) { 
              if (byteArray.length < 16) {
                // console.log(byteArray);
                // process.stdout.write(Buffer.from(byteArray).toString('hex'));
                const output = JSON.stringify(Array.from(byteArray));  // 转成字符串数组
                 process.stdout.write(output);

                process.stdout.write("\n");
              } else {
                // console.log(`${byteArray.length} bytes`);
                process.stdout.write(`${byteArray.length} bytes`);
                process.stdout.write("\n");
                hexDumpWithIndent(indent + "    ", byteArray);
              }
            }else {
                console.log("value convert to ProtocolComposite failed.");
              }
              break;

          case ValueTypeClassStruct:
             if (this.value instanceof ProtocolComposite) {
              console.log();
              this.value.dumpIndent(indent + "    ");
            } else {
              console.log("value convert to ProtocolComposite failed.");
            }
            break;

          case ValueTypeClassArray:
             if (this.value instanceof ProtocolComposite) {
              console.log();
              this.value.dumpIndent(indent + "    ");
            } else {
              console.log("value convert to ProtocolComposite failed.");
            }
            break;
    
          default:
            console.log("shouldn't be such a data type");
        }
    }

    ToJson(jsonLevel) {
        switch (jsonLevel) {
          case JsonLevelOriginal:
            return this.ToJsonOriginal();
          case JsonLevelSimple:
            return this.ToJsonSimple();
          case JsonLevelDetail:
            return this.ToJsonDetail();
          case JsonLevelCustom:
            return this.ToJsonCustom();
          default:
            throw new Error('Unsupported json level');
        }
    }

    ToJsonOriginal() {
        const type = this.getValueClass();
    
        switch (type) {
          case ValueTypeClassInt:
          case ValueTypeClassFloat:
          case ValueTypeClassString:
          case ValueTypeClassExpr:
          case ValueTypeClassBytes:
            console.log(JSON.stringify(this.value));
            return JSON.stringify(this.value);
    
          case ValueTypeClassStruct:
          case ValueTypeClassArray:
            if (this.value instanceof ProtocolComposite) {
                console.log(11);
              return this.value.ToJson(JsonLevelOriginal);
            } else {
              throw new Error("ToJson Error: value convert to ProtocolComposite failed.");
            }
    
          default:
            throw new Error("ToJson Error: unsupported value class");
        }
    }

    ToJsonSimple() {
        const type = this.getValueClass();

        switch (type) {
          case ValueTypeClassInt:
          case ValueTypeClassFloat:
          case ValueTypeClassString:
          case ValueTypeClassExpr:
            const val = this.showvalue !== "" ? this.showvalue : this.value;
            return JSON.stringify(typeof val === 'bigint' ? val.toString() : val);
            // return JSON.stringify(this.showvalue !== "" ? this.showvalue : this.value);
    
          case ValueTypeClassBytes:
            const byteArray = Object.values(this.value); // [26, 207, 252, 29]
            const buffer = Buffer.from(byteArray);
            return JSON.stringify(buffer.toString('base64')); // 或 'utf-8' / 'ascii' / 'hex' / 'base64'
            // return JSON.stringify(this.value);
    
          case ValueTypeClassStruct:
          case ValueTypeClassArray:
            if (this.value instanceof ProtocolComposite) {
              return this.value.ToJson(JsonLevelSimple);
            } else {
              throw new Error("ToJson Error: value convert to ProtocolComposite failed.");
            }
    
          default:
            throw new Error("ToJson Error: unsupported value class");
        }
    }

    ToJsonDetail() {
        let originalValue = null;
    
        const type = this.getValueClass();
    
        switch (type) {
          case ValueTypeClassInt:
          case ValueTypeClassFloat:
          case ValueTypeClassString:
          case ValueTypeClassBytes:
            originalValue = this.value;
            break;
    
          case ValueTypeClassStruct:
          case ValueTypeClassArray:
            if (this.value instanceof ProtocolComposite) {
              return this.value.ToJson(JsonLevelDetail);
            } else {
              throw new Error("ToJson Error: value convert to ProtocolComposite failed.");
            }
    
          case ValueTypeClassExpr:
            originalValue = 0; // 固定为 0（表达式不能直接还原？）
            break;
    
          default:
            throw new Error("ToJson Error: unsupported value class");
        }
    
        const detail = {
          id: this.valueID,
          name: this.stxField.name || '',
          originalValue: originalValue,
          engineerValue: this.showvalue,
          stateValue: this.state
        };
    
        try {
          return JSON.stringify(detail);
        } catch (err) {
          console.error('ToJson error:', err);
          throw new Error('ToJson error: ' + err.message);
        }
    }

    async ToJsonCustom() {
        const type = this.getValueClass();
    
        switch (type) {      
            case ValueTypeClassStruct:
            case ValueTypeClassArray:
              if (this.value instanceof ProtocolComposite) {
                return await this.value.ToJson(JsonLevelCustom);
              } else {
                throw new Error("ToJson Error: value convert to ProtocolComposite failed.");
              }
      
            case ValueTypeClassExpr:
              originalValue = 0; // 固定为 0（表达式不能直接还原？）
              break;
      
            default:
              throw new Error("ToJson Error: unsupported value class");
          }    
        throw new Error("ToJson Error: unsupported value class");
    }

    // 创建新的 ProtocolValue
    newValue(field, valueID) {
        const { pc: pc, ok: ok } = this.getValueComposite();
        if (!ok) {
            return null;
        }
        
        const value = ProtocolValue.NewProtocolValue(this, field, valueID);
        pc.addValue(valueID, value);
        return value;
    }

    // 获取 ProtocolComposite（类似 Go 的 GetValueComposite 方法）
    getValueComposite() {
        if (this.value instanceof ProtocolComposite) {
            return { pc: this.value, ok: true };
        }
        return { pc: null, ok: false };
    }

    // 添加临时的值映射
    addTempValueMap(valueID, value) {
        const { pc: pc, ok: ok } = this.getValueComposite();
        if (ok && typeof pc.addTempValueMap === "function") {
            pc.addTempValueMap(valueID, value);
        }
    }

    // 删除临时的 ProtocolValue 映射，用于计算表达式
    removeTempValueMap(valueID) {
        const { pc: pc, ok: ok } = this.getValueComposite();
        if (ok && typeof pc.removeTempValueMap === "function") {
            pc.removeTempValueMap(valueID);
        }
    }

    setPosBegin(pos) {
        this.posBegin = pos; // 设置起始位置
    }

    setPosEnd(pos) {
        this.posEnd = pos;// 设置结束位置
    }

    SetState(state) {
        this.state = state;
    }

    SetDetermined(bOk) {
        this.determined = Boolean(bOk); // 确保转换为布尔值
    }

    isDetermined() {
        return this.determined;//是否确定
    }

    IsValueClassArray() {
        return (this.valueType & ValueTypeClassArray) !== 0; // 判断是否是数组类型
    }

    IsValueClassBytes() {
        return (this.valueType & ValueTypeBytes) !== 0;
    }

    IsValueClassString() {
        return (this.valueType & ValueTypeClassString) !== 0;
    }

    IsValueClassInt() {
        return (this.valueType & ValueTypeClassInt) !== 0;
    }

    IsValueClassFloat() {
        return (this.valueType & ValueTypeClassFloat) !== 0;
    }
    
    setValueArray() {
        this.valueType = ValueTypeArray; // 假设 ValueTypeArray 是一个定义好的常量
        let pc = new ProtocolComposite(this, null, true);
        this.value = pc;
    }

    SetValueStruct(stxType) {
        this.valueType = ValueTypeStruct;
        let pc = new ProtocolComposite(this, stxType, false);
        this.value = pc;
    }

    setValueFromResult(parent, result) {
        this.valueType = ValueTypeStruct; // 设置值类型为结构体
        result.root.SetParent(parent); // 设置 result.root 的父级
        let {pc: pc, ok: ok} = result.root.getValueComposite(); // 获取复合值
        this.value = pc; // 赋值
    }

    updateDeterminedFromChild() {
        let { pc: valueComposite, ok: found } = this.getValueComposite();
        if (found) {
            this.determined = valueComposite.isDetermined();
        }
    }


    SetValueInt(value) {
        this.valueType = ValueTypeInt; // 这里模拟设置值的类型为 'ValueTypeInt'
        this.value = value;      // 在 JavaScript 中，使用 BigInt 处理 64 位整数
    }

    SetValueUInt(value) {
        this.valueType = ValueTypeUInt; // 或者使用字符串 "ValueTypeUInt" 来表示类型
        this.value = value;
    }

    SetValueFloat32(value) {// 将值设置为 float32 类型（模拟为 float64）
        this.valueType = ValueTypeFloat32;  // 类似于 Go 的 ValueTypeFloat32
        this.value = value;  // JavaScript 中的 float 是双精度浮动点数（即 float64）
    }

    SetValueFloat64(value) {
        this.valueType = ValueTypeFloat64;
        this.value = value;
    }

    // 设置值为字符串类型
    SetValueString(value) {
        this.valueType = ValueTypeString; // 设置为字符串类型标识
        this.value = value; // 将传入的值设置为 ProtocolValue 的值
    }

     // 设置值为字节数组（Buffer）
    SetValueBytes(value) {
        this.valueType = ValueTypeBytes; // 设置类型标识
        this.value = value; // 确保存储为 Buffer 类型
    }

    SetShowValue(showvalue) {
        this.showvalue = showvalue;
    }
    
    SetParent(parent) {
        this.parent = parent;
    }

    SetShowValueDefault() {
        switch (this.getValueClass()) {
            case ValueTypeClassInt:
            case ValueTypeClassFloat:
            case ValueTypeClassString:
                this.showvalue = String(this.value); // 转换为字符串
                break;
            case ValueTypeClassBytes:
            case ValueTypeClassStruct:
            case ValueTypeClassArray:
                // 不进行任何操作，与 Go 代码一致
                break;
            default:
                // 其他情况（可以留空或做特殊处理）
                break;
        }
    }

     // 设置值类型为表达式（Expr）
    SetValueExpr() {
        this.valueType = ValueTypeExpr; // 设置类型标识
        this.value = null; // 清空值
    }

    GetValueBytes() {
        if (this.value instanceof Uint8Array) {
            return [this.value, true];  // 返回字节数组
        }
        return [null, false];  // 不是 Uint8Array 类型，返回 null 和 false
    }

    GetValueString() {
        if (typeof this.value === 'string') {
            return [this.value, true];
        }
        return [null, false];
    }

    GetValueInt() {
        if (this.valueType === ValueTypeUInt) {
            // 假设 uintValue 是 BigInt 类型
            if (typeof this.value === 'bigint') {
                return [this.value, true];  // 直接返回 BigInt 类型
            }
            if (typeof this.value === 'number'){
                return [BigInt(this.value), true];
            }else{
                return [BigInt(0), false];  // 如果是非 BigInt 类型，返回 0（BigInt 类型）  
            }
        }
        else{
            return [ this.value , true];
        } 
    }

    GetValueFloat() {
        if (typeof this.value === 'number') {
            return [this.value, true];  // 如果 value 是 float64 类型（在 JavaScript 中是 number）
        }
        return [null, false];  // 如果不是 float64 类型，返回 NaN 和 false
    }

    getValueClass() {
        return this.valueType & ValueTypeClassMask;
    }
    
    // 获取表达式值
    GetValueExpr() {
        switch (this.getValueClass()) {
            case ValueTypeClassInt:
            case ValueTypeClassFloat: {
                const [intVal, ok] = this.GetValueInt();
                if (ok) {
                    return `${intVal}`; // 返回整数表达式
                }
                break;
            }
            case ValueTypeClassString: {
                const [strVal, ok] = this.GetValueString();
                if (ok) {
                    return `"${strVal}"`; // 返回字符串表达式
                }
                break;
            }
            case ValueTypeClassExpr:
                return `"${this.showvalue}"`; // 返回表达式值
            default:
                if (this.value !== null && this.value !== undefined) {
                    return `${this.value}`; // 默认返回值的字符串形式
                }
                return this.showvalue; // 如果没有值，返回 showvalue
        }
    }

    getValueByValueID(valueID) {
        const { pc: pc, ok: ok } = this.getValueComposite();
        if (ok) {
            return pc.getValueByValueID(valueID);
        }
        return [null, false];  // 返回 null 和 false
    }

    
    
    // 判断是否与 Content 相同
    EqualContent(content) {
        if (this.IsValueClassBytes()) {
            const byteArray = new Uint8Array(content);
            if (byteArray instanceof Uint8Array) {
                let [bytesValue, n] = this.GetValueBytes();
                if (content.length !== bytesValue.length) {
                    return [false, new ProtocolError("ProtocolErrorContents", "Contents size dismatch")];
                }
                return [this.bytesEqual(byteArray, bytesValue), null];
            }
        } else if (this.IsValueClassString()) {
            if (content instanceof Uint8Array) {
                let [strValue, n] = this.GetValueString();
                let bytesArray = new TextEncoder().encode(strValue);
                if (content.length < bytesArray.length) {
                    return [false, new ProtocolError("ProtocolErrorContents", "Contents size is smaller than string")];
                }
                return [this.bytesEqual(content.subarray(0, bytesArray.length), bytesArray), null];
            }
        } else if (this.IsValueClassInt()) {
            if (typeof content === 'bigint') {
                const [intValue, ok] = this.GetValueInt();
                return [intValue === content, null];
            }
        } else if (this.IsValueClassFloat()) {
            if (typeof content === "number") {
                let floatValue = this.GetValueFloat();
                return [floatValue === content, null];
            }
        }
        return [false, new ProtocolError("ProtocolErrorContents", `Unsupported contents: ${content}`)];
    }

    bytesEqual(bytesContent, bytesValue) {
        if (!(bytesContent instanceof Uint8Array) || !(bytesValue instanceof Uint8Array)) {
            return false; // 确保都是 Uint8Array 类型
        }
    
        if (bytesContent.length !== bytesValue.length) {
            return false; // 长度不同，直接返回 false
        }
    
        for (let i = 0; i < bytesContent.length; i++) {
            if (bytesContent[i] !== bytesValue[i]) {
                return false; // 只要有一个字节不同，就返回 false
            }
        }
        
        return true; // 所有字节都相同
    }
    
}
  

class ProtocolComposite {
    constructor(ownedby, stxType, isArray) {
      this.ownedby = ownedby;
      this.stxType = stxType;
      this.isArray = isArray;
      this.valueMap = new Map();  // 使用 Map 存储键值对;  // 对应 Go 中的 map[string]*ProtocolValue
      this.valueArr = [];  // 对应 Go 中的 []*ProtocolValue
    }
    

    isDetermined() {
        return this.valueArr.every(val => val.isDetermined());
    }
     // 添加值到 valueMap 和 valueArr
    addValue(valueID, pv) {
        this.valueMap.set(valueID, pv); // ✅ 正确使用 Map.set()
        this.valueArr.push(pv);         // ✅ 存入数组
    }
    
    // 添加临时的值映射
    addTempValueMap(valueID, pv) {
        this.valueMap.set(valueID, pv);  // 使用 Map 的 set 方法来添加键值对
    }

    // 删除临时的 ProtocolValue 映射，用于计算表达式
    removeTempValueMap(valueID) {
        this.valueMap.delete(valueID);
    }

    getValueByValueID(valueID) {
        const val = this.valueMap.get(valueID);
        const ok = this.valueMap.has(valueID)
        return [val, ok];  // 返回一个包含值和存在状态的数组
    }
  
    IsArray() {
        return this.isArray; // 返回 isArray 属性的值
      }
    
    dumpIndent(indent) {
        if (this.IsArray()) {
            console.log(`${indent}array has ${this.valueArr.length} elements`);
            this.valueArr.forEach((val) => {
                    val.dumpValue(indent);
            });
        }else{
            this.valueArr.forEach((val) => {   
                    val.dumpValue(indent);
            });
        }
      }
   
    ToJson(jsonLevel) {
        switch (jsonLevel) {
          case JsonLevelOriginal:
          case JsonLevelSimple:
          case JsonLevelDetail: {
            let result = '';
            if (this.IsArray()) {
              result += '[';
              this.valueArr.forEach((value, index) => {
                if (index > 0) result += ',';
                result += JSON.stringify(value.ToJson(jsonLevel));
              });
              result += ']';
            } else {
              result += '{';
              this.valueArr.forEach((value, index) => {
                if (index > 0) result += ',';
                result += `${JSON.stringify(value.valueID)}:${JSON.stringify(value.ToJson(jsonLevel))}`;
              });
              result += '}';
            }
            return result;
          }
          case JsonLevelCustom: {
            if (!this.stxType || !this.stxType.Json) {
              throw new Error('自定义 JSON 数据未定义');
            }
            return this.ToJsonCustom(this.stxType.Json);
          }
          default:
            throw new Error('不支持的 JSON 级别');
        }
    }

    ToJsonCustom(arrJson) {
        let result = '{';
        for (let i = 0; i < arrJson.length; i++) {
          const js = arrJson[i];
          if (i > 0) {
            result += ',';
          }
    
          if (js.id !== "") {
            result += JSON.stringify(js.id) + ':';
          }
    
          switch (js.type) {
            case 'value': {
              const value = this.ownedby.getValueByIdentifier(js.value);
              let jsonValue;
              if (value === null || value === undefined) { // 如果无法提取 ProtocolValue，直接返回 js.Value
                jsonValue = JSON.stringify(js.value);
              } else {
                jsonValue = value.ToJson(js.levelDone);
              }
              result += jsonValue;
              break;
            }
            case 'object': {
              try {
                const jsonValue = this.ToJsonCustom(js.object);
                result += jsonValue;
              } catch (err) {
                throw new Error(err);
              }
              break;
            }
            case 'embed': {
              const value = this.ownedby.getValueByIdentifier(js.value);
              if (value === null || value === undefined) {
                throw new Error('Value not found for embed');
              }
              let jsonValue = value.ToJson(js.levelDone);
              // 去除两边的{}或[]
              jsonValue = jsonValue.slice(1, jsonValue.length - 1);
              result += jsonValue;
              break;
            }
            default:
              throw new Error(`Unknown Type: ${js.Type}`);
          }
        }
        result += '}';
        return result;
      }

  }
function hexDumpWithIndent(indent, data) {
    const hexString = Array.from(data)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
  
    const lines = [];
    const bytesPerLine = 16;
  
    for (let i = 0; i < hexString.length; i += bytesPerLine * 3) {
      lines.push(indent + hexString.slice(i, i + bytesPerLine * 3));
    }
  
    console.log(lines.join("\n"));
  }



//   // 只导出 Stream 类
// module.exports = ProtocolResult; // CommonJS 方式导出

module.exports = {
    ProtocolResult,
    ProtocolValue,
    ProtocolComposite
};
