import { PrismaClient } from "../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7은 드라이버 어댑터가 필수라 어댑터 없이 new PrismaClient()를 만들면
// 모듈 로드 시점에 예외가 난다(정적 export 빌드의 config 수집 단계 포함).
// 그래서 실제 사용 시점까지 생성을 지연시키고, 사용처의 try/catch에서
// DATABASE_URL 부재/연결 실패를 흡수할 수 있게 한다.
function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaMariaDb(url) });
}

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrisma();
  }
  return globalForPrisma.prisma;
}

// 지연 생성 프록시: 첫 속성 접근 때 비로소 PrismaClient를 만든다.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
