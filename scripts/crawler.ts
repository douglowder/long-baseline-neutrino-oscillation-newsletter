#!/usr/bin/env yarn --silent ts-node --transpile-only

import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { promises as fs } from 'fs';

const urlSet = new Set<string>();

const timeoutAsync = (ms: number) =>
  new Promise<void>((resolve, reject) => {
    setTimeout(() => resolve(), ms);
  });

// const urlMap = new Map<string, string>();

const rootUrl = 'http://www.hep.anl.gov/ndk/longbnews';
const rootUrlRegEx = new RegExp(`${rootUrl}/`, 'g');

const filenameForUrl = (url: string) =>
  url === rootUrl ? 'index.html' : path.basename(url);

const sanitizeHtml = (html: string) => {
  // Trim lines
  const trimmedHtml = html
    .split('\n')
    .map((l) => l.trim().replace(rootUrlRegEx, ''))
    .join('\n');
  // Remove script tags
  const $ = cheerio.load(trimmedHtml);
  $('script').each((index, element) => {
    $(element).remove();
  });
  // Remove javascript anchors
  $('a').each((index, element) => {
    const childUrl = $(element).attr('href');
    if (childUrl?.startsWith('javascript:')) {
      $(element).remove();
    }
    if (childUrl?.startsWith('/cdn-cgi')) {
      $(element).remove();
    }
  });
  // Remove "mail to" tag
  const editedHtml: string = $.html().replace('<br>mail to-', '');
  // Return sanitized HTML
  return editedHtml;
};

const crawlAsync = async (url: string) => {
  console.log(`Crawling URL = ${url}`);
  console.log(`File path = ${filenameForUrl(url)}`);
  urlSet.add(url);
  const response = await axios.get(url);
  const data: string = await response.data;
  // urlMap.set(url, html);
  if (!(url === rootUrl || url.endsWith('html'))) {
    await fs.writeFile(path.join('.', 'site', filenameForUrl(url)), data, {
      encoding: 'binary',
    });
    return;
  }
  const html = sanitizeHtml(data);
  await fs.writeFile(path.join('.', 'site', filenameForUrl(url)), html, {
    encoding: 'utf-8',
  });

  const $ = cheerio.load(html);
  const children: string[] = [];
  $('html')
    .find('a[href]')
    .each((index, piece) => {
      let childUrl = $(piece).attr('href');
      if (!childUrl) {
        return;
      }
      if (!(childUrl.startsWith('http') || childUrl.startsWith('www'))) {
        childUrl = new URL(childUrl, `${rootUrl}/`).href;
      }
      if (childUrl?.startsWith(rootUrl) && !urlSet.has(childUrl)) {
        children.push(childUrl);
      }
    });
  for (const childUrl of children) {
    try {
      await crawlAsync(childUrl);
    } catch (e) {}
    await timeoutAsync(500);
  }
};

crawlAsync(rootUrl);
