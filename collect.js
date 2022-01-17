"use strict";

const puppeteer = require("puppeteer");

const fs = require("fs");
const request = require("request");
const { argv } = require("process");

const searchWord = argv[2];
const searchLimit = parseInt(argv[3]);
const widthLimit = parseInt(argv[4]);
const heightLimit = parseInt(argv[5]);

const savPath = "./result/" + searchWord;
const imgPath = savPath + "/images";
const datPath = savPath + "/data";

let browser;
const option = { headless: true };
(async () => {
  //Init
  if (!(searchWord && searchLimit)) return;

  try {
    browser = await puppeteer.launch(option);
    const searchPage = await openPage(
      "https://ja.wikipedia.org/w/index.php?title=%E7%89%B9%E5%88%A5:%E6%A4%9C%E7%B4%A2&limit=" +
        searchLimit +
        "&offset=0&ns0=1&search=" +
        searchWord
    );

    const urls = await searchPage.$$eval(
      "div.mw-search-result-heading > a",
      (elements) => elements.map((element) => element.href)
    );
    console.log("Search Result:" + urls.length);

    makeSaveDirectories();
    await Promise.all(
      urls.map(
        async (url) => await saveFilesAll(searchWord, await openPage(url))
      )
    );
  } catch (error) {
    console.log(error);
  } finally {
    await browser.close();
  }
})();

//---functions---
function makeSaveDirectories() {
  if (!fs.existsSync(savPath)) {
    fs.mkdirSync(savPath);
  }
  if (!fs.existsSync(imgPath)) {
    fs.mkdirSync(imgPath);
  }
  if (!fs.existsSync(datPath)) {
    fs.mkdirSync(datPath);
  }
}

async function openPage(url) {
  console.log("Open: " + url);
  const page = await browser.newPage();
  await page.goto(url);
  return page;
}
async function getImageInfos(page) {
  return await page.$$eval(
    "#bodyContent a>img",
    (imgs, { widthLimit, heightLimit }) =>
      imgs
        .filter((img) => img.width > widthLimit && img.height > heightLimit)
        .map((img) => {
          const url = img.src.replace("/thumb/", "/").replace(/\/[^\/]+$/, "");
          const fileName = url.split("/").pop();
          return { url, fileName };
        }),
    { widthLimit, heightLimit }
  );
}
async function saveFilesAll(searchWord, linkPage) {
  const linkInfo = { url: await linkPage.url(), title: await linkPage.title() };
  const imageInfos = await getImageInfos(linkPage);
  console.log(imageInfos.length + " matched Images in " + linkInfo.title);
  await Promise.all(
    imageInfos.map(
      async (imageInfo) => await saveFiles(searchWord, linkInfo, imageInfo)
    )
  );
}
async function saveFiles(searchWord, pageInfo, imageInfo) {
  console.log("Requesting:" + imageInfo.url);
  const sendRequest = () =>
    request(
      { method: "GET", url: imageInfo.url, encoding: null },
      (err, res, body) => {
        if (!err && res.statusCode === 200) {
          console.log("Request:Success");
          fs.writeFile(
            imgPath + "/" + imageInfo.fileName,
            body,
            "binary",
            saveJson(searchWord, pageInfo, imageInfo)
          );
        } else {
          console.log("Request:Failed");
          await sleep(100);
          sendRequest();
        }
      }
    );
}
function saveJson(searchWord, pageInfo, imageInfo) {
  const jsonData = JSON.stringify({
    searchWord: searchWord,
    pageUrl: pageInfo.url,
    pageTitle: pageInfo.title,
    imageUrl: imageInfo.url,
    imageTitle: imageInfo.fileName,
  });
  fs.writeFileSync(datPath + "/" + imageInfo.fileName + ".json", jsonData);
}
