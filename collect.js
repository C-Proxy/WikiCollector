"use strict";

// const puppeteer = require("puppeteer");
// const fs = require("fs");
// const request = require("request");
// const pqueue = require("p-queue");
import puppeteer from "puppeteer";
import pqueue from "p-queue";
import fs from "fs";
import request from "request";

import { argv } from "process";

// const { argv } = require("process");

const searchWord = argv[2];
const searchLimit = parseInt(argv[3]);
const widthLimit = parseInt(argv[4]);
const heightLimit = parseInt(argv[5]);

const resPath = "./result";
const savPath = resPath + "/" + searchWord;
const imgPath = savPath + "/images";
const datPath = savPath + "/data";

const maxTrials = 10;
const interval = 5000;

let browser;
let queue;
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

    const srcUrls = await searchPage.$$eval(
      "div.mw-search-result-heading > a",
      (elements) => elements.map((element) => element.href)
    );
    console.log("Search Result:" + srcUrls.length);

    makeSaveDirectories();

    queue = new pqueue({ concurrency: 4 });

    queue.on("idle", () => {
      console.log("Queue is idle");
    });
    // queue.on("add", () => {
    // console.log("Add to Queue");
    // });
    queue.on("completed", (result) => {
      console.log(result);
    });

    const srcInfos = [].concat(
      ...(await Promise.all(
        srcUrls.map(async (url) => await getSourceInfos(url))
      ))
    );
    console.log("Matched Images: " + srcInfos.length);

    // srcInfos.forEach((srcInfo) => assignSaveTaskToQueue(srcInfo, 0));
    const tasks = srcInfos.map((srcInfo) => assignSaveTaskToQueue(srcInfo, 0));

    await Promise.all(tasks);
    console.log("All Tasks Done!");
  } catch (error) {
    console.log(error);
  } finally {
    await browser.close();
  }
})();

//---functions---
function makeSaveDirectories() {
  if (!fs.existsSync(resPath)) {
    fs.mkdirSync(resPath);
  }
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
function assignSaveTaskToQueue(srcInfo, trials) {
  const imageInfo = srcInfo.imageInfo;
  return queue.add(async () => {
    const statusCode = await trySavePromise(imageInfo);
    const fileName = imageInfo.fileName;
    if (statusCode === 200) {
      saveJson(srcInfo);
      return "Success: " + fileName;
    } else {
      if (trials < maxTrials) {
        await new Promise((res) => setTimeout(res, interval));
        assignSaveTaskToQueue(srcInfo, trials + 1);
        return (
          "Retry(" + statusCode + ":" + (trials + 1) + "times): " + fileName
        );
      } else {
        return "Failed: " + fileName;
      }
    }
  });
}

async function openPage(url) {
  console.log("Open: " + url);
  const page = await browser.newPage();
  await page.goto(url);
  return page;
}
async function getSourceInfos(url) {
  const srcPage = await openPage(url);
  const pageInfo = await getPageInfo(srcPage);
  return (await getImageInfos(srcPage)).map((imageInfo) => ({
    pageInfo,
    imageInfo,
  }));
}
async function getPageInfo(page) {
  return { url: await page.url(), title: await page.title() };
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
// async function saveAllImagesFromPage(searchWord, linkPage) {
//   const linkInfo = { url: await linkPage.url(), title: await linkPage.title() };
//   const imageInfos = await getImageInfos(linkPage);
//   console.log(imageInfos.length + " matched Images in " + linkInfo.title);
//   await Promise.all(
//     imageInfos.map(
//       async (imageInfo) =>
//         await saveImages(imageInfo, () =>
//           saveJson(searchWord, linkInfo, imageInfo)
//         )
//     )
//   );
// }
function trySavePromise(imageInfo) {
  return new Promise((resolve) => {
    request(
      { method: "GET", url: imageInfo.url, encoding: null },
      (err, res, body) => {
        const code = res.statusCode;
        if (!err && code === 200) {
          fs.writeFile(
            imgPath + "/" + imageInfo.fileName,
            body,
            "binary",
            () => {
              console.log("SaveImage:" + imageInfo.fileName);
            }
          );
        }
        resolve(code);
      }
    );
  });
}
// async function saveImages(imageInfo, successCallback, errorCallback) {
//   console.log("Requesting:" + imageInfo.url);
//   request(
//     { method: "GET", url: imageInfo.url, encoding: null },
//     (err, res, body) => {
//       if (!err && res.statusCode === 200) {
//         console.log("Success: " + imageInfo.fileName);
//         fs.writeFile(
//           imgPath + "/" + imageInfo.fileName,
//           body,
//           "binary",
//           callback
//         );
//         return true;
//       } else {
//         console.log("Failed(" + res.statusCode + "): " + imageInfo.fileName);
//         setTimeout(sendRequest, 5000);
//         return false;
//       }
//     }
//   );
// }
function saveJson(srcInfo) {
  const pageInfo = srcInfo.pageInfo,
    imageInfo = srcInfo.pageInfo;
  const fileName = imageInfo.title;
  const jsonData = JSON.stringify({
    searchWord: searchWord,
    pageUrl: pageInfo.url,
    pageTitle: pageInfo.title,
    imageUrl: imageInfo.url,
    imageTitle: fileName,
  });
  fs.writeFileSync(datPath + "/" + fileName + ".json", jsonData);
  // console.log("SaveJson: " + fileName);
}
