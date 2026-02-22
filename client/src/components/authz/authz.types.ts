// src/components/authz/authz.types.ts

export interface Network {
  name: string;
  slug: string;
  rpc: string;
  rest: string;
  denom: string;
  decimals: number;
  chainId?: string;
  bech32Prefix?: string;
  logo: string | null;
}

export interface Grant {
  msgType: string;
  label: string;
  grantee: string;
  expiry: string | null;
}

export interface Proposal {
  proposal_id: string;
  title: string;
  status: string;
  voting_end_time: string;
}

export type VoteOption =
  | "VOTE_OPTION_YES"
  | "VOTE_OPTION_NO"
  | "VOTE_OPTION_NO_WITH_VETO"
  | "VOTE_OPTION_ABSTAIN";

export const GRANT_MSG_TYPES = [
  { value: "/cosmos.gov.v1beta1.MsgVote",                                       label: "Governance Vote (v1beta1)" },
  { value: "/cosmos.gov.v1.MsgVote",                                             label: "Governance Vote (v1)" },
  { value: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",            label: "Withdraw Delegator Reward" },
  { value: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",        label: "Withdraw Validator Commission" },
] as const;

export const MSG_LABEL: Record<string, string> = {
  "/cosmos.gov.v1beta1.MsgVote":                                          "Vote (v1beta1)",
  "/cosmos.gov.v1.MsgVote":                                               "Vote (v1)",
  "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward":              "Withdraw Reward",
  "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission":          "Withdraw Commission",
};

export const shorten = (str: string, head = 8, tail = 6) =>
  str ? `${str.slice(0, head)}...${str.slice(-tail)}` : "";

export const formatExpiry = (exp: string | null) => {
  if (!exp) return "Never";
  const d = new Date(exp);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};