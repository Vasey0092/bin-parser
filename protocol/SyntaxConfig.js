const fs = require('fs');  // 引入文件系统模块
const util = require('util'); // 引入 util 模块，用于对象格式化输出
const yaml = require('js-yaml');  // 引入js-yaml模块
const { convertToInt64, mixedInterfacesToBytes } = require('./utils'); // 引入 utils.js

const JsonLevelOriginal = 0x00000001;
const JsonLevelEngineer = 0x00000002;
const JsonLevelSimple = 0x00000002;
const JsonLevelDetail = 0x00000003;
const JsonLevelCustom = 0x00000004;   

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

const FieldSizeClassNull = 0x00000000;
const FieldSizeClassFixed = 0x00000001;
const FieldSizeClassEOSRelated = 0x00000002;
const FieldSizeClassEOSOnly = 0x00000002;
const FieldSizeClassExprRelated = 0x00000010;
const FieldSizeClassExpr = 0x00000010;
const FieldSizeClassExprWithEOS = 0x00000012;

// SyntaxMeta 定义了YAML中meta
class SyntaxMeta {
  constructor(id, name, doc = "", endian = "", payload = "") {
    this.id = id;
    this.name = name;
    this.doc = doc;
    this.endian = endian;
    this.payload = payload;
  }
}

// Enum类型的别名
class SyntaxEnum {
  constructor(enums = {}) {
    this.enumMap = new Map();

     // 遍历传入的对象，将键转换为数字（如果可能的话）
     for (const [key, value] of Object.entries(enums)) {
      const numericKey = isNaN(key) ? key : BigInt(key); // 尝试将键转换为数字
      this.enumMap.set(numericKey, value);
    }
  }

}

class SyntaxTypeSwitchOnCasesJson {
  /**
   * 创建一个新的 SyntaxTypeSwitchOnCasesJson 实例
   * @param {Array<SyntaxTypeSwitchOnCasesJsonItem>} cases - 用于初始化的 case 项数组
   */
  constructor(cases = []) {
    this.cases = cases;
  }
}

// SyntaxRepeatDone 类定义
class SyntaxRepeatDone {
  constructor() {
    this.repeatClass = RepeatClassNull;
    this.countExpr = '';
    this.countDone = 0;
    this.untilExpr = '';
    this.untilNextField = null;
  }

  GetClass() {
    return this.repeatClass & RepeatClassMask;
  }

  IsUntilCurr() {
    return this.repeatClass === RepeatClassUntilCurr;
  }

  IsUntilNext() {
    return this.repeatClass === RepeatClassUntilNext;
  }
}

// SyntaxTypeDone 类定义
class SyntaxTypeDone {
  constructor() {
    this.typeClass = null;
    this.count = 0;
    this.bigEndian = false;
    this.fieldType = "";
    this.switchOn = null;
  }

  /**
     * 初始化字段类型
     * @param {string} fieldType - 字段类型
     */
  InitTypeClass(fieldType) {
    this.fieldType = fieldType;

    switch (true) {
        case fieldType === "":
            this.typeClass = FieldTypeClassNull;
            break;

        case /^u[1-8](le|be)?$/.test(fieldType): // 匹配 u1 ~ u8, u1be ~ u8be, u1le ~ u8le
            this.typeClass = FieldTypeClassInt | FieldSubTypeUInt;
            this.count = parseInt(fieldType.substring(1, 2), 10);
            if (fieldType.length === 4) {
                this.typeClass |= FieldSetEndianBit;
                this.bigEndian = fieldType.endsWith("be");
            }
            break;

        case /^s[1-8](le|be)?$/.test(fieldType): // 匹配 s1 ~ s8, s1be ~ s8be, s1le ~ s8le
            this.typeClass = FieldTypeClassInt | FieldSubTypeInt;
            this.count = parseInt(fieldType.substring(1, 2), 10);
            if (fieldType.length === 4) {
                this.typeClass |= FieldSetEndianBit;
                this.bigEndian = fieldType.endsWith("be");
            }
            break;

        case /^b[1-9]$|^b[1-3][0-9]$/.test(fieldType): // 匹配 b1 ~ b32
            this.typeClass = FieldTypeClassInt | FieldSubTypeBit;
            this.count = parseInt(fieldType.substring(1), 10);
            break;

        case /^f4(le|be)?$/.test(fieldType): // 匹配 f4, f4le, f4be
            this.typeClass = FieldTypeClassFloat | FieldSubTypeFloat32;
            if (fieldType.length === 4) {
                this.typeClass |= FieldSetEndianBit;
                this.bigEndian = fieldType.endsWith("be");
            }
            break;

        case /^f8(le|be)?$/.test(fieldType): // 匹配 f8, f8le, f8be
            this.typeClass = FieldTypeClassFloat | FieldSubTypeFloat64;
            if (fieldType.length === 4) {
                this.typeClass |= FieldSetEndianBit;
                this.bigEndian = fieldType.endsWith("be");
            }
            break;

        case fieldType === "str":
            this.typeClass = FieldTypeClassString;
            break;

        case fieldType === "bytes":
            this.typeClass = FieldTypeClassBytes;
            break;

        case fieldType === "expr":
            this.typeClass = FieldTypeClassExpr;
            break;

        default:
            this.typeClass = FieldTypeClassStruct;
            break;
    }
   
  }


  // 针对switch_on, 类似下面的语法：解析类型
// type:
//
//	switch-on: info_type_number
//	cases:
//	  302: tm302_data
//	  _: tm_other_data
/**
   * 初始化 switch-on 类型的 case 处理
   * @param {Object} casesItem - 可能是对象 (map) 或者其他类型
   * @throws {Error} 如果数据格式不正确
   */
  InitTypeClassForSwitchCases(casesItem) {
    this.switchOn.caseArr = new Map();
    if (typeof casesItem === "object" && casesItem !== null) {
      for (let [caseValue, caseType] of casesItem) {
        if (typeof caseType !== "string") {
          throw new Error(`switch_on ${this.switchOn.switchExpr} case type ${caseType} is not a string`);
        }
        let intcaseValue = Number(caseValue);
        if (typeof intcaseValue === "number" && !isNaN(intcaseValue)) {
          this.switchOn.caseArr.set(intcaseValue, caseType);
          continue;
        }

        let strcaseValue = caseValue;
        if (strcaseValue === "_") {
          this.switchOn.caseDefault = caseType;
          continue;
        }

        throw new Error(`switch_on ${this.switchOn.switchExpr} case value ${caseValue} is not correct`);
      }
      return null;
    }

    throw new Error(`switch_on ${this.switchOn.switchExpr} is not correct`);
  }

// 针对switch_on, json文件：解析类型
// type:
//
//	switch-on: info_type_number
//		cases-json: file://../protocol/info_type_switch.json
//	 或
//		cases-json: http://localhost/protocol/get_protocol?type=info_type

  /**
   * 初始化 typeDone 对象中的 switch-on 配置
   * @param {string} casesJsonUrl - cases json 的 URL
   */
  async InitTypeClassForSwitchCasesJson(casesJsonUrl) {//暂缓
    try {
      // 读取 JSON 数据
      const jsonData = await Utils.readDataFromURL(casesJsonUrl);
      
      // 解析 JSON 数据
      let casesJson = new SyntaxTypeSwitchOnCasesJson;
      try {
        casesJson = JSON.parse(jsonData);
      } catch (err) {
        throw new Error(`Unmarshal JSON failed from ${casesJsonUrl}: ${err.message}`);
      }

      // 初始化 caseArrConfig
      this.switchOn.caseArrConfig = new Map();

      // 遍历 Cases 数组
      for (const item of casesJson.cases) {
        let config;
        try {
          config = await newSyntaxConfigFromURL(item.ConfigFile);
        } catch (err) {
          throw new Error(`Can't create parser from ${item.ID}:${item.ConfigFile} - ${err.message}`);
        }

        // 处理默认项（ID 为 _）
        if (item.ID === "_") {
          this.switchOn.caseDefaultConfig = config;
        } else {
          // 将 ID 转换为整数并存储
          const intID = parseInt(item.ID, 10);
          if (isNaN(intID)) {
            throw new Error(`Can't convert to int for parser from ${item.ID}:${item.ConfigFile}`);
          }
          this.switchOn.caseArrConfig.set(intID, config);
        }
      }
    } catch (err) {
      throw new Error(`ReadDataFromURL failed from ${casesJsonUrl}: ${err.message}`);
    }
  }
}

class SyntaxSizeDone {
  /**
   * 构造函数
   * @param {number} sizeClass - size 类别 (对应 uint32)
   * @param {number} sizeFixed - 固定 size 大小 (对应 int)
   * @param {string} sizeExpr - size 表达式
   */
  constructor(sizeClass = 0, sizeFixed = 0, sizeExpr = "") {
      this.sizeClass = sizeClass; // size 类别
      this.sizeFixed = sizeFixed; // 固定 size 大小
      this.sizeExpr = sizeExpr;   // size 表达式
  }

  /**
   * 设置固定大小的 size
   * @param {number} size - 固定 size 值
   */
  SetFixedSize(size) {
    this.sizeClass = FieldSizeClassFixed; // 设定大小类别
    this.sizeFixed = size; // 设定固定大小值
  }

  GetFixedSize() {
    if (this.sizeClass === FieldSizeClassFixed) {
      return this.sizeFixed;
    }
    return 0;
  }

  IsSizeFixed() {
    return this.sizeClass === FieldSizeClassFixed;
  }

  IsSizeEOSOnly() {
    return this.sizeClass === FieldSizeClassEOSOnly;
  }

  IsSizeExprRelated() {
    return (this.sizeClass & FieldSizeClassExprRelated) !== 0;
  }

  IsSizeEOSRelated() {
    return (this.sizeClass & FieldSizeClassEOSRelated) !== 0;
  }
}

class SyntaxTypeSwitchOn {
  /**
   * 构造函数
   * @param {string} switchExpr - switch_on 表达式
   */
  constructor(switchExpr = "") {
      this.switchExpr = switchExpr; // switch_on 表达式
      this.caseArr = new Map(); // 存储 `caseArr`，键为 `int64`（JS 使用 Map）
      this.caseDefault = ""; // 默认 case
      this.caseArrConfig = new Map(); // 存储 `caseArrConfig`，键为 `int64`
      this.caseDefaultConfig = new SyntaxConfig; // 默认配置
  }
}

// SyntaxField 定义了YAML中seq
class SyntaxField {
  constructor(field) {
    // 默认值
    this.id = field.id || null;
    this.name = field.name || null;
    this.type = field.type || null;
    this.enum = field.enum || null;
    this.size = field.size || null;
    this.expr = field.expr || null;
    this.contents = field.contents || null;
    this.default = field.defaultValue || null;
    this.setValue = field.setValue || null;
    this.input = field.input || null;
    this.repeat = field.repeat || null;

    //加工处理后的数据
    this.typeDone = new SyntaxTypeDone();
    this.contentDone = null;
    this.defaultDone = null;
    this.sizeDone = null;
    this.enumDone = null;
    this.repeatDone = null;
  }

  GetFieldType() {
    return this.typeDone.fieldType;
  }

  GetFieldTypeSwitchOn() {
    return this.typeDone.switchOn;
  }

  GetFieldTypeClass() {
    return this.typeDone.typeClass & FieldTypeClassMask;
  }

  GetFieldTypeClassCombo() {
    return this.typeDone.typeClass & FieldTypeClassComboMask;
  }

  GetFieldSubType() {
    return this.typeDone.typeClass & FieldSubTypeMask;
  }

  GetFieldTypeInternalCount() {
    return this.typeDone.count;
  }

  IsFieldTypeSetEndian() {
    return (this.typeDone.typeClass & FieldSetEndianBit) !== 0;
  }

  IsFieldTypeBigEndian() {
    return this.typeDone.bigEndian;
  }


  InitFixedSize(size) {
    this.sizeDone = new SyntaxSizeDone();  // 创建新的 SyntaxSizeDone 实例
    this.sizeDone.sizeClass = FieldSizeClassFixed;  // 设置 sizeClass 为固定大小类型
    this.sizeDone.sizeFixed = size;  // 设置固定大小
  }

  InitRepeat() {
    let repeatDone = new SyntaxRepeatDone();

    // Regex for repeat patterns
    const exprPattern = /^count\((.*)\)$/;
    const untilPattern = /^until\((.*)\)$/;
    if (exprPattern.test(this.repeat)) {
      const match = exprPattern.exec(this.repeat);
      repeatDone.repeatClass = RepeatClassCount;
      repeatDone.countExpr = match[1];
      repeatDone.countDone = 0; // Default: not parsed yet

      const count = parseInt(repeatDone.countExpr, 10);
      if (!isNaN(count)) {
        if(count <= 0){
          throw new Error("invalid repeat count: %s", this.repeat);
        }
        repeatDone.countDone = count;

      } 
    } else if (untilPattern.test(this.repeat)) {
      const match = untilPattern.exec(this.repeat);
      repeatDone.repeatClass = RepeatClassUntil;
      repeatDone.untilExpr = match[1];
      const currPattern = /(^|\s)(curr)(\.\w+)*\s/;
      // 如果匹配到curr
      if (currPattern.test(repeatDone.untilExpr)) {
        repeatDone.repeatClass = RepeatClassUntilCurr;  // 设置为RepeatClassUntilCurr
      } else {
        // 匹配next.字段的正则表达式
        const nextPattern = /\bnext\.([a-zA-Z][a-zA-Z0-9]*)\b/;
        const submatches = repeatDone.untilExpr.match(nextPattern);  // 获取匹配的子字符串

        if (submatches) {
          const fieldType = submatches[1];  // 获取字段类型
          repeatDone.repeatClass = RepeatClassUntilNext;  // 设置为RepeatClassUntilNext
          repeatDone.untilNextField = NewTempSyntaxField("next", fieldType);  // 创建一个新的 TempSyntaxField
          // 获取字段类型的类型类
          const typeClass = repeatDone.untilNextField.GetFieldTypeClass();

          if (typeClass !== FieldTypeClassInt && typeClass !== FieldTypeClassFloat) {
            throw new Error(`[id: ${f.id}] unsupport repeat ${f.Repeat} for until next ${fieldType}`);
          }
          // 替换 untilExpr 中的 next.XXX 为 next
          repeatDone.untilExpr = repeatDone.untilExpr.replace(nextPattern, 'next');
        }
      }
    } else {
      throw new Error(`Unsupported repeat pattern: ${this.repeat}`);
    }

    this.typeDone.typeClass |= FieldTypeClassComboArray;
    this.repeatDone = repeatDone;
    return null;
  }

  InitSize() {
    this.sizeDone = new SyntaxSizeDone(FieldSizeClassNull)
    // 尝试预处理size是固定值的情况，提高后续解析速度
    let size = parseInt(this.size, 0); // 自动识别进制（10、16 进制等）
    if (!isNaN(size)) { // 解析成功
        if (size <= 0) {
            throw new Error(`invalid size: ${this.size}`);
        }
        this.sizeDone.SetFixedSize(size);
        return null;
    }
    if (this.size === "eos") {
      this.sizeDone.sizeClass = FieldSizeClassEOSOnly;
      return null;
  }

  // 如果 size 包含 "eos"，则设置对应的 sizeClass
  const eosPattern = /\beos\b/; // 匹配独立的 "eos" 单词
  if (eosPattern.test(this.size)) {
      this.sizeDone.sizeClass = FieldSizeClassExprWithEOS;
  } else {
      this.sizeDone.sizeClass = FieldSizeClassExpr;
  }

  // 记录 size 表达式
  this.sizeDone.sizeExpr = this.size;
  return null; 
  }

  /**
     * 初始化字段类型
     * @throws {Error} 如果字段类型不支持
     */
  InitType() {
    if (typeof this.type === "string") {
        this.typeDone.InitTypeClass(this.type);
        return null;
    }

    if (this.type === null) {
        if (this.contents !== null) {
            this.typeDone.InitTypeClass("bytes");
            return null;
        }
    }

    if (typeof this.type === "object" && this.type !== null) {
        if ("switch-on" in this.type) {
            const switchOn = this.type["switch-on"];
            if (typeof switchOn !== "string") {
                throw new Error(`[id: ${this.id}] switch-on type is not correct`);
            }

            this.typeDone.typeClass = FieldTypeClassSwitchOn;
            this.typeDone.switchOn = new SyntaxTypeSwitchOn(switchOn);

            let success = false;

            if ("cases-json" in this.type) {
                const casesJson = this.type["cases-json"];
                if (typeof casesJson === "string") {
                    try {
                        this.typeDone.InitTypeClassForSwitchCasesJson(casesJson);
                        success = true;
                    } catch (error) {
                        throw new Error(`[id: ${this.id}] cases-json init failed: ${error.message}`);
                    }
                }
            }

            if ("cases" in this.type) {
                // const casesItem = this.type["cases"];
                const casesItem = new Map(Object.entries(this.type["cases"]));
                const updatedcaseItem = new Map();

                for (let [key, value] of casesItem) {
                    const numericKey = Number(key); // 将键转换为数字

                    // 如果转换成功（不是 NaN），则将数字键和值加入到新的 Map 中
                    if (!isNaN(numericKey)) {
                        updatedcaseItem.set(numericKey, value);
                    } else {
                        // 如果不能转换为数字，可以保持原键不变
                        updatedcaseItem.set(key, value);
                    }
                }
                this.type["cases"] = updatedcaseItem;

                try {
                    this.typeDone.InitTypeClassForSwitchCases(updatedcaseItem);
                    success = true;
                } catch (error) {
                    throw new Error(`[id: ${this.id}] cases-json init failed: ${error.message}`);
                }
            }

            if (!success) {
                throw new Error(`[id: ${this.id}] switch-on type is not correct`);
            }
            return null;
        }
    }

    throw new Error(`[id: ${this.id}] unsupported field type: ${JSON.stringify(this.type)}`);
  }

  InitFieldValueForContent(content) {
    switch (this.GetFieldTypeClass()) {
        case FieldTypeClassNull:
        case FieldTypeClassBytes:
        case FieldTypeClassString: {
            let bytesContent;
            if (Array.isArray(content)) {
                // 调用工具函数进行转换
                bytesContent = mixedInterfacesToBytes(content);
                if (!bytesContent) {
                    throw new Error(`[id: ${this.id}] contents is not correct: ${content}`);
                }
            } else if (typeof content === "string") {
                bytesContent = new TextEncoder().encode(content);
            } else {
                throw new Error(`[id: ${this.id}] contents is not correct for number type: ${content}`);
            }
            const size = bytesContent.result.length;
            if (this.sizeDone) {
                if (this.sizeDone.IsSizeFixed() && this.sizeDone.GetFixedSize() !== size) {
                    throw new Error(`[id: ${this.id}] size and contents size mismatch`);
                }
            } else {
                this.InitFixedSize(size);
            }
            this.contentDone = bytesContent.result;
            break;
        }

        case FieldTypeClassInt: {
            const intContent = convertToInt64(content);
            if (intContent === null) {
                throw new Error(`[id: ${this.id}] contents is not correct for number int type: ${content}`);
            }
            this.contentDone = BigInt(intContent);
            break;
        }

        case FieldTypeClassFloat: {
            const floatContent = Number(content);
            if (floatContent === null) {
                throw new Error(`[id: ${this.id}] contents is not correct for number float type: ${content}`);
            }
            this.contentDone = floatContent;
            break;
        }

        default:
            throw new Error(`[id: ${this.ID}] unsupported content for type ${this.typeDone?.fieldType}`);
    }

    return null;
 }

  InitFieldValueForDefault(content) {//未完
    switch (this.GetFieldTypeClass()) {
        case FieldTypeClassNull:
        case FieldTypeClassBytes:
        case FieldTypeClassString: {
            let bytesContent;
            if (Array.isArray(content)) {
                // 调用工具函数进行转换
                bytesContent = mixedInterfacesToBytes(content);
                if (!bytesContent) {
                    throw new Error(`[id: ${this.id}] contents is not correct: ${content}`);
                }
            } else if (typeof content === "string") {
                bytesContent = new TextEncoder().encode(content);
            } else {
                throw new Error(`[id: ${this.id}] contents is not correct for number type: ${content}`);
            }

            const size = bytesContent.length;
            if (this.sizeDone) {
                if (this.sizeDone.IsSizeFixed() && this.sizeDone.GetFixedSize() !== size) {
                    throw new Error(`[id: ${this.id}] size and contents size mismatch`);
                }
            } else {
                this.InitFixedSize(size);
            }
            this.defaultDone = bytesContent;
            break;
        }

        case FieldTypeClassInt: {
            const intContent = convertToInt64(content);
            if (intContent === null) {
                throw new Error(`[id: ${this.id}] contents is not correct for number int type: ${content}`);
            }
            this.defaultDone = BigInt(intContent);
            break;
        }

        case FieldTypeClassFloat: {
            const floatContent = Number(content);
            if (floatContent === null) {
                throw new Error(`[id: ${this.id}] contents is not correct for number float type: ${content}`);
            }
            this.defaultDone = floatContent;
            break;
        }

        default:
            throw new Error(`[id: ${this.ID}] unsupported content for type ${this.typeDone?.fieldType}`);
    }

    return null;
  }
}

// SyntaxJson 定义了YAML中json
class SyntaxJson {
  /**
   * 构造函数
   * @param {string} id - 唯一标识符
   * @param {string} type - 类型
   * @param {string} level - 级别
   * @param {string} value - 值
   * @param {SyntaxJson[]} object - 子对象数组
   */
  constructor(json = {}) {
    this.id = json.id || '';           // 唯一标识符
    this.type = json.type || '';       // 类型
    this.level = json.level || '';     // 级别
    this.value = json.value || '';     // 值
    this.object = json.object || [];         // 子对象数组

    this.levelDone = json.levelDone ||null;        // 处理后的 JSON 导出级别
  }

  /**
   * 初始化 SyntaxJson 对象，并设置 levelDone
   * @param {number} defaultLevel - 默认级别
   */
  InitSyntaxJson(defaultLevel) {
    switch (this.level) {
      case "simple":
        this.levelDone = JsonLevelSimple;
        break;
      case "detail":
        this.levelDone = JsonLevelDetail;
        break;
      case "custom":
        this.levelDone = JsonLevelCustom;
        break;
      default:
        this.levelDone = defaultLevel;
    }

    // 递归处理子对象
    for (let subjs of this.object) {
      let json = new SyntaxJson(subjs);
      try {
        json.InitSyntaxJson(this.levelDone);
      } catch (err) {
        throw new Error(`Error processing sub-object with ID ${subjs.id}: ${err.message}`);
      }
    }
  }
}

// SyntaxType 定义了YAML中type复合类型
class SyntaxType {
  /**
   * 构造函数
   * @param {SyntaxField[]} seq - 顺序字段数组
   * @param {Object.<string, SyntaxEnum>} enums - 枚举映射
   * @param {SyntaxJson[]} json - 自定义 JSON 输出
   */
  constructor(type={}) {

      this.seq = type.seq || [];      // 数组，存储 SyntaxField 实例
      this.enums = new Map(
        Object.entries(type.enums || {}) // 避免 undefined 或 null 报错
      );   // 对象，键为字符串，值为 SyntaxEnum 实例,字典
      this.json = type.json || [];    // 数组，存储 SyntaxJson 实例
  }
}

// SyntaxDefaultConfig 定义了解析后的默认配置信息
class SyntaxDefaultConfig {
  /**
   * 构造函数
   * @param {boolean} bigEndian - 是否使用大端字节序（默认 false）
   */
  constructor(bigEndian = false) {
      this.bigEndian = bigEndian;
  }
}

// SyntaxConfig 是顶层的语法配置结构体
class SyntaxConfig {
  constructor() {
    this.meta = new SyntaxMeta();
    this.root = new SyntaxType();
    this.types = {};
    this.enums = {};
    this.defaultConfig = new SyntaxDefaultConfig();
  }

  IsDefaultBigEndian() {
    return this.defaultConfig.bigEndian;
  }

  InitSyntaxField(ownerType, field) {

    if (field.size) {
      let err = field.InitSize();
      if(err) return err;
    }

    let err = field.InitType();

    if(err) return err;

    if (field.contents) {
      let err = field.InitFieldValueForContent(field.contents);
      if(err) return err;

      field.defaultDone = field.contentDone
    }

    if (field.default) {
      let err = field.InitFieldValueForDefault(field.defaulte);
      if(err) return err;
    }

    if (field.enum) {
      if((field.typeDone.typeClass&FieldTypeClassInt) === 0){
        return new Error(`[id: ${field.id}] unsupported data type ${field.typeDone.fieldType} for enum`);
      }

      let pEnum = ownerType.enums.get(field.enum); 
      if (!pEnum) {
          pEnum = this.enums[field.enum];
          // pEnum = new Map(
          //   Object.entries(pEnum).map(([k, v]) => [isNaN(k) ? k : BigInt(k), v])
          // );
          // this.enums[field.enum] = pEnum;
          field.enumDone = pEnum;

          if (!pEnum) {
            return new Error(`[id: ${field.id}] unknown enum type ${field.enum}`);
        }
      }else{
          pEnum = new Map(
          Object.entries(pEnum).map(([k, v]) => [isNaN(k) ? k : BigInt(k), v])
        );

          field.enumDone = pEnum;

      }
      
      
    }

    if (field.repeat) {
      let err = field.InitRepeat();
      if(err) return err;
    }

  }

  /**
   * 初始化语法元数据
   * @throws {Error} 如果 meta.endian 不是 "le" 或 "be"，抛出错误
   */
  InitSyntaxMeta() {
    this.defaultConfig.bigEndian = true;  // 默认大端

    if (!this.meta.endian || this.meta.endian === "be") {
        this.defaultConfig.bigEndian = true;
    } else if (this.meta.endian === "le") {
        this.defaultConfig.bigEndian = false;
    } else {
        throw new Error("endian in meta must be 'le' or 'be'");
    }
    return null;
  }

  InitSyntaxEnums(){
    return null;
  }


  InitSyntaxType(syntaxType) {
    let n = 0;
    for (const field of syntaxType.seq) {
      let syntaxField = new SyntaxField(field);
      // console.log("synfield",syntaxField);
      let err = this.InitSyntaxField(syntaxType, syntaxField);
      syntaxType.seq[n] = syntaxField;
      n++;
      if (err) {
        return err;
      }
    }

    let m = 0;
    for (const json of syntaxType.json) {
      let syntaxJson = new SyntaxJson(json);
      let err = syntaxJson.InitSyntaxJson(JsonLevelSimple);
      syntaxType.json[m] = syntaxJson;
      m++;
      if (err) {
        return err;
      }
    }
    return null;
  }

  InitSyntaxRoot() {
    return this.InitSyntaxType(this.root);
  }

  InitSyntaxTypes() {
    for (const subtype of Object.values(this.types)) {

      let err = this.InitSyntaxType(subtype);
      if (err) {
        return err;
      }
    }
    return null;
  }

  InitSyntax() {
    let err = null;
    err = this.InitSyntaxMeta();
    if(err){
      throw new Error("Meta fail!");
    }
    err = this.InitSyntaxEnums();
    if(err){
      throw new Error("Enums fail!");
    }
    err = this.InitSyntaxRoot();
    if(err){
      throw new Error("Root fail!");
    }
    err = this.InitSyntaxTypes();
    if(err){
      throw new Error("Types fail!");
    }

    return err;
  }

   // 从 YAML 文件加载配置
  LoadConfigFromFile(yamlFile) {
    return new Promise((resolve, reject) => {
      fs.readFile(yamlFile, 'utf8', (err, data) => {
          if (err) {
              return reject (new Error(`Can't open config file ${yamlFile}: ${err}`));
          }

          let config;
          try {
              config = yaml.load(data);  // 将 YAML 数据解析为 JavaScript 对象
       
          } catch (e) {
            return reject (new Error(`Can't unmarshal config file ${yamlFile}: ${e.message}`));
          }
          
          // c = this.InitSyntax(config);  
          // resolve(c);
          // 创建 SyntaxConfig 实例
          const syntaxConfig = new SyntaxConfig();
          
          // 将解析后的数据赋值给实例的属性
          if (config.meta) {
              syntaxConfig.meta = new SyntaxMeta(config.meta.id, config.meta.name, config.meta.doc, config.meta.endian, config.meta.payload);
          }

          if (config.root) {
              syntaxConfig.root = new SyntaxType(config.root);
          }
  
          if (config.types) {
            syntaxConfig.types = {};
            for (const key in config.types) {
           
              syntaxConfig.types[key] = new SyntaxType(config.types[key]);
            }
              // syntaxConfig.types = config.types;  // Assuming types is a simple object map
          }

          if (config.enums) {
            syntaxConfig.enums = {};
            for (const key in config.enums) {
                if (Object.hasOwnProperty.call(config.enums, key)) {
                  syntaxConfig.enums[key] = new Map(
                    Object.entries(config.enums[key]).map(([k, v]) => [isNaN(k) ? k : BigInt(k), v])
                );
                }
            }
        }

        syntaxConfig.InitSyntax();

        resolve(syntaxConfig);
      }); 
    });
  }

  async LoadConfigFromURL(yamlURL) {
    try {
        const response = await fetch(yamlURL);
        if (!response.ok) {
            throw new Error(`Can't open config file ${yamlURL}: ${response.statusText}`);
        }
        
        const data = await response.text(); // 读取 YAML 文件内容
        let config;
        
        try {
            config = jsyaml.load(data); // 解析 YAML 数据
        } catch (e) {
            throw new Error(`Can't unmarshal config file ${yamlURL}: ${e.message}`);
        }

        // 创建 SyntaxConfig 实例
        const syntaxConfig = new SyntaxConfig();

        // 解析 meta 信息
        if (config.meta) {
            syntaxConfig.meta = new SyntaxMeta(config.meta.id, config.meta.name, config.meta.doc, config.meta.endian, config.meta.payload);
        }

        // 解析 root 信息
        if (config.root) {
            syntaxConfig.root = new SyntaxType(config.root);
        }

        // 解析 types
        if (config.types) {
            syntaxConfig.types = {};
            for (const key in config.types) {
                syntaxConfig.types[key] = new SyntaxType(config.types[key]);
            }
        }

        // 解析 enums
        if (config.enums) {
            syntaxConfig.enums = {};
            for (const key in config.enums) {
                if (Object.hasOwnProperty.call(config.enums, key)) {
                    syntaxConfig.enums[key] = new Map(
                        Object.entries(config.enums[key]).map(([k, v]) => [isNaN(k) ? k : BigInt(k), v])
                    );
                }
            }
        }

        syntaxConfig.InitSyntax();

        return syntaxConfig;
    } catch (error) {
        console.error(error);
        throw error;
    }
}
}

// 创建临时 SyntaxField 字段，用于解析临时字段
function NewTempSyntaxField(idstr, fieldType) {
  const tempfield = {
    id : idstr,
    type : fieldType,
  };
  const field = new SyntaxField(tempfield);
  field.InitType();  // 初始化字段类型
  return field;
}

function removeAnsiCodes(str) {
  // 使用正则表达式匹配并移除 ANSI 转义码
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

module.exports = SyntaxConfig;


// config.LoadConfigFromURL(yamlpath)
//   .then(config => console.log('Loaded Config:', config))
//   .catch(err => console.error('Failed to load config:', err));




async function loadConfig() {
  const yamlpath = "test/protocol/zip.yaml";
  const config = new SyntaxConfig();
    try {
        const finalConfig = await config.LoadConfigFromFile(yamlpath);
        // console.log("final config", finalConfig); // 打印最终的配置对象

        // 将 syntaxConfig 转换为文本（字符串）
        let configText = util.inspect(finalConfig, { showHidden: false, depth: null, colors: true });

        // 移除 ANSI escape codes 颜色编码
        configText = removeAnsiCodes(configText);

        // 输出到一个 .txt 文件中
        const outputFile = "D:/AAAbishe/protocoljs/test/out/syntaxConfig_output.txt";
        fs.writeFileSync(outputFile, configText);  // 使用同步写入，确保文件写入完成

        console.log(`syntaxConfig has been written to ${outputFile}`);
    } catch (err) {
        console.error("Error loading config:", err);
    }
}

loadConfig();


