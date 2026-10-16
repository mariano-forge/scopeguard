// Any /api address no route answers: a JSON 404, rather than the agency's catch-all page (HTML, 200),
// so a misaddressed call never looks like it worked. Routes that exist are matched first.

const notFound = () => Response.json({ error: "Route inconnue" }, { status: 404 });

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
