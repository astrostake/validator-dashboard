// src/routes/networks.ts

import { Router, Request, Response } from "express";
import axios from "axios";
import { INITIAL_CHAINS, CHAIN_ASSETS } from "../config";

const router = Router();

const isPrivateUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  } catch {
    return false;
  }
};

const toSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

// ─── GET /api/networks ────────────────────────────────────────────────────────

router.get("/networks", (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  const networks = INITIAL_CHAINS.map((chain) => {
    const slug = toSlug(chain.name);

    const rpc  = isPrivateUrl(chain.rpc)  ? `${baseUrl}/proxy/${slug}/rpc`  : chain.rpc;
    const rest = isPrivateUrl(chain.rest) ? `${baseUrl}/proxy/${slug}/rest` : chain.rest;

    return {
      name:         chain.name,
      slug,
      rpc,
      rest,
      denom:        chain.denom,
      decimals:     chain.decimals,
      chainId:      chain.chainId      || null,
      bech32Prefix: chain.bech32Prefix || null,
      coingeckoId:  chain.coingeckoId  || null,
      logo:         CHAIN_ASSETS[chain.name] || null,
    };
  });

  res.json({ success: true, data: networks });
});

// ─── Proxy ────────────────────────────────────────────────────────────────────

const proxyRequest = async (targetBase: string, req: Request, res: Response) => {
  try {
    const subPath  = req.path === '/' ? '' : req.path;
    const targetUrl = `${targetBase}${subPath}`;

    const response = await axios({
      method:  req.method as any,
      url:     targetUrl,
      params:  req.query,
      data:    req.method !== 'GET' ? req.body : undefined,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      timeout: 10000,
    });

    res.status(response.status).json(response.data);
  } catch (err: any) {
    const status  = err.response?.status || 502;
    const message = err.response?.data   || err.message;
    res.status(status).json({ success: false, error: message });
  }
};

INITIAL_CHAINS.forEach((chain) => {
  const slug = toSlug(chain.name);

  if (isPrivateUrl(chain.rpc)) {
    router.use(`/proxy/${slug}/rpc`, (req: Request, res: Response) => {
      proxyRequest(chain.rpc, req, res);
    });
  }

  if (isPrivateUrl(chain.rest)) {
    router.use(`/proxy/${slug}/rest`, (req: Request, res: Response) => {
      proxyRequest(chain.rest, req, res);
    });
  }
});

export default router;