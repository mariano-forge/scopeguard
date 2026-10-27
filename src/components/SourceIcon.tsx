"use client";

// Where a request came from, as a small icon (src/lib/requestSource.ts): the official logo for Slack, Teams
// and Figma, unchanged, as their brand rules allow to say where something comes from (their colours belong
// to the logo: the one exception to Kora's tokens); a Kora glyph on a neutral disc for the other channels.
// What was made in Kora shows none: most requests are, a mark on each said nothing (24 October 2026).

import { useId } from "react";
import { Ellipsis, Mail, Phone, Users, type LucideIcon } from "lucide-react";
import type { RequestChannel } from "@/lib/requestSource";

/** Slack's mark (2019), as published by Slack. */
function SlackLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 127 127" aria-hidden="true" focusable="false">
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A" />
      <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0" />
      <path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill="#2EB67D" />
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E" />
    </svg>
  );
}

/** Figma's mark, as published by Figma. */
function FigmaLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 300" aria-hidden="true" focusable="false">
      <path d="M50 300c27.6 0 50-22.4 50-50v-50H50c-27.6 0-50 22.4-50 50s22.4 50 50 50z" fill="#0acf83" />
      <path d="M0 150c0-27.6 22.4-50 50-50h50v100H50c-27.6 0-50-22.4-50-50z" fill="#a259ff" />
      <path d="M0 50C0 22.4 22.4 0 50 0h50v100H50C22.4 100 0 77.6 0 50z" fill="#f24e1e" />
      <path d="M100 0h50c27.6 0 50 22.4 50 50s-22.4 50-50 50h-50V0z" fill="#ff7262" />
      <path d="M200 150c0 27.6-22.4 50-50 50s-50-22.4-50-50 22.4-50 50-50 50 22.4 50 50z" fill="#1abcfe" />
    </svg>
  );
}

/** Microsoft Teams' mark (2018), as published by Microsoft; its gradient named per icon (several on a page). */
function TeamsLogo({ size }: { size: number }) {
  const gradient = `teams-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 2228.833 2073.333" aria-hidden="true" focusable="false">
      <path fill="#5059C9" d="M1554.637,777.5h575.713c54.391,0,98.483,44.092,98.483,98.483v524.398c0,199.901-162.051,361.952-361.952,361.952h-1.711c-199.901,0.028-361.975-162-362.004-361.901V828.971C1503.167,800.544,1526.211,777.5,1554.637,777.5z" />
      <circle fill="#5059C9" cx="1943.75" cy="440.583" r="233.25" />
      <circle fill="#7B83EB" cx="1218.083" cy="336.917" r="336.917" />
      <path fill="#7B83EB" d="M1667.323,777.5H717.01c-53.743,1.33-96.257,45.931-95.01,99.676v598.105c-7.505,322.519,247.657,590.16,570.167,598.053c322.51-7.893,577.671-275.534,570.167-598.053V877.176C1763.579,823.431,1721.066,778.83,1667.323,777.5z" />
      <path opacity=".1" d="M1244,777.5v838.145c-0.258,38.435-23.549,72.964-59.09,87.598c-11.316,4.787-23.478,7.254-35.765,7.257H667.613c-6.738-17.105-12.958-34.21-18.142-51.833c-18.144-59.477-27.402-121.307-27.472-183.49V877.02c-1.246-53.659,41.198-98.19,94.855-99.52H1244z" />
      <path opacity=".2" d="M1192.167,777.5v889.978c-0.002,12.287-2.47,24.449-7.257,35.765c-14.634,35.541-49.163,58.833-87.598,59.09H691.975c-8.812-17.105-17.105-34.21-24.362-51.833c-7.257-17.623-12.958-34.21-18.142-51.833c-18.144-59.476-27.402-121.307-27.472-183.49V877.02c-1.246-53.659,41.198-98.19,94.855-99.52H1192.167z" />
      <path opacity=".2" d="M1192.167,777.5v786.312c-0.395,52.223-42.632,94.46-94.855,94.855h-447.84c-18.144-59.476-27.402-121.307-27.472-183.49V877.02c-1.246-53.659,41.198-98.19,94.855-99.52H1192.167z" />
      <path opacity=".2" d="M1140.333,777.5v786.312c-0.395,52.223-42.632,94.46-94.855,94.855H649.472c-18.144-59.476-27.402-121.307-27.472-183.49V877.02c-1.246-53.659,41.198-98.19,94.855-99.52H1140.333z" />
      <path opacity=".1" d="M1244,509.522v163.275c-8.812,0.518-17.105,1.037-25.917,1.037c-8.812,0-17.105-0.518-25.917-1.037c-17.496-1.161-34.848-3.937-51.833-8.293c-104.963-24.857-191.679-98.469-233.25-198.003c-7.153-16.715-12.706-34.071-16.587-51.833h258.648C1201.449,414.866,1243.801,457.217,1244,509.522z" />
      <path opacity=".2" d="M1192.167,561.355v111.442c-17.496-1.161-34.848-3.937-51.833-8.293c-104.963-24.857-191.679-98.469-233.25-198.003h190.228C1149.616,466.699,1191.968,509.051,1192.167,561.355z" />
      <path opacity=".2" d="M1192.167,561.355v111.442c-17.496-1.161-34.848-3.937-51.833-8.293c-104.963-24.857-191.679-98.469-233.25-198.003h190.228C1149.616,466.699,1191.968,509.051,1192.167,561.355z" />
      <path opacity=".2" d="M1140.333,561.355v103.148c-104.963-24.857-191.679-98.469-233.25-198.003h138.395C1097.783,466.699,1140.134,509.051,1140.333,561.355z" />
      <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="198.099" y1="1683.0726" x2="942.2344" y2="394.2607" gradientTransform="matrix(1 0 0 -1 0 2075.3333)">
        <stop offset="0" stopColor="#5a62c3" />
        <stop offset=".5" stopColor="#4d55bd" />
        <stop offset="1" stopColor="#3940ab" />
      </linearGradient>
      <path fill={`url(#${gradient})`} d="M95.01,466.5h950.312c52.473,0,95.01,42.538,95.01,95.01v950.312c0,52.473-42.538,95.01-95.01,95.01H95.01c-52.473,0-95.01-42.538-95.01-95.01V561.51C0,509.038,42.538,466.5,95.01,466.5z" />
      <path fill="#FFF" d="M820.211,828.193H630.241v517.297H509.211V828.193H320.123V727.844h500.088V828.193z" />
    </svg>
  );
}

/** The other sources: a Kora glyph on a neutral disc, the same for all (globals.css .source-icon). */
const glyphs: Partial<Record<RequestChannel, LucideIcon>> = { email: Mail, call: Phone, meeting: Users, other: Ellipsis };

export function SourceIcon({ channel, size = 16 }: { channel: RequestChannel; size?: number }) {
  if (channel === "slack") return <SlackLogo size={size} />;
  if (channel === "teams") return <TeamsLogo size={size} />;
  if (channel === "figma") return <FigmaLogo size={size} />;
  const Glyph = glyphs[channel] ?? Ellipsis;
  return (
    <span className={`source-icon source-icon-${channel}`} style={{ width: size, height: size }} aria-hidden="true">
      <Glyph />
    </span>
  );
}
