const COS = require('cos-nodejs-sdk-v5')
const fs = require('fs')
const path = require('path')
const tencentcloud = require('tencentcloud-sdk-nodejs')
const CdnClient = tencentcloud.cdn.v20180606.Client
const PurgePathCacheRequest = tencentcloud.cdn.v20180606.Models.PurgePathCacheRequest

const Credential = tencentcloud.common.Credential
const ClientProfile = tencentcloud.common.ClientProfile
const HttpProfile = tencentcloud.common.HttpProfile

/* const config = {
  SecretId: process.env.SecretId,
  SecretKey: process.env.SecretKey,
  Bucket: process.env.Bucket,
  Region: process.env.Region,
  filePath: process.env.filePath
} */
const config = {
  SecretId: process.argv[2],
  SecretKey: process.argv[3],
  Bucket: process.argv[4],
  Region: process.argv[5],
  filePath: process.argv[6]
}

console.log(config)

const cos = new COS({
    SecretId: config.SecretId,
    SecretKey: config.SecretKey
})

function initCdnClient() {
  const cred = new Credential(config.SecretId, config.SecretKey)
  const httpProfile = new HttpProfile()
  httpProfile.endpoint = "cdn.tencentcloudapi.com"
  const clientProfile = new ClientProfile()
  clientProfile.httpProfile = httpProfile
  return new CdnClient(cred, "ap-guangzhou", clientProfile)
}

function sendPurgePathCacheRequest() {
  const req = new PurgePathCacheRequest()
  const params = {
    Paths: ['https://www.yzer.club'],
    FlushType: 'delete'
  }
  req.deserialize(params)
  console.log(req)

  console.log('Start update yozh cdn')
  const client = initCdnClient()
  client.PurgePathCache(req, function(errMsg, response) {
    if (errMsg) {
      console.log('failed')
      console.log('failed: ', errMsg)
      return;
    }
    console.log('success')
    console.log(response)
  })
}

function putObject(filePath) {
  // const filePath = path.join(folder, fileName)
  const fileName = path.relative(config.filePath, filePath)
  console.log('上传名称: ', fileName)
  // 调用方法
  cos.putObject({
    Bucket: config.Bucket, /* 必须 */ // Bucket 格式：test-1250000000
    Region: config.Region,
    Key: fileName, /* 必须 */
    onTaskReady: function (tid) {
        TaskId = tid
    },
    onProgress: function (progressData) {
        console.log(JSON.stringify(progressData))
    },
    // 格式1. 传入文件内容
    // Body: fs.readFileSync(filePath),
    // 格式2. 传入文件流，必须需要传文件大小
    Body: fs.createReadStream(filePath),
    ContentLength: fs.statSync(filePath).size
  }, function (err, data) {
      if (err) {
        console.error(err)
      }
      fs.unlinkSync(filePath)
  })
}

// 上传文件夹
function updateFolder(folder, parentFolder) {
  const folderPath = path.resolve(folder)
  fs.readdir(folderPath, (err, data) => {
    if (err) {
      console.error(err)
      return
    }
    data.forEach(fileName => {
      const fileDir = path.join(folder, fileName)
      fs.stat(fileDir, (err, stat) => {
        if (err) {
          console.error(err)
          return
        }
        if (stat.isFile()) {
          fixFile(data, fileDir, parentFolder)
          console.log('上传文件: ', fileDir)
          putObject(fileDir)
        } else if (stat.isDirectory()) {
          console.log('获取文件夹: ', fileDir)
          updateFolder(fileDir, fileName)
        }
      })
    })
  })
}

function fixFile(data, fileName, parentFolder) {
  if (!parentFolder) {
    return
  }
  ext = path.extname(fileName)
  if (ext !== '.html') {
    return
  }
  console.log('当前文件夹为: ', parentFolder)
  const file = fs.readFileSync(fileName, { encoding: 'UTF-8' })
  if (!file) {
    return
  }
  let result
  if (data.length > 1) {
    // 目录下的文件数量超过 1, 那就说明存在其他资源文件
    result = replaceImageUrl(file, parentFolder)
  }
  /* if (result) {
    result = replaceEmoji(result)
  } else {
    result = replaceEmoji(file)
  } */
  if (result) {
    fs.writeFileSync(fileName, result, { encoding: 'UTF-8' })
    console.log('写入文件: ', fileName)
  }
}

/**
 * 通过对比文件夹名称来修改 html 中图片路径
 * 逻辑就是递归整个目录，当目录中存在包含 html 文件的子目录时，
 * 就判断 html 中是否包含目录名称的图片路径
 * @param {String} file 文件内容
 * @param {String} parentFolder 文件夹名称
 */
function replaceImageUrl(file, parentFolder) {
  // 将相对路径替换为绝对路径
  return replace(file, `<img src="./${parentFolder}/`, `<img src="/${parentFolder}/`)
}

function replaceEmoji(file) {
  return replace(file, '<span class="github-emoji" style="background-image: url.*?\\)"', '<span class="github-emoji" style="background-image: none;"')
}

function replace(file, cur, rep) {
  const reg = new RegExp(cur, 'g')
  if (!reg.test(file)) {
    return
  }
  console.log('匹配 ', cur)
  return file.replace(reg, rep)
}

sendPurgePathCacheRequest()
updateFolder(config.filePath)