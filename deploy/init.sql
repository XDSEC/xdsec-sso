CREATE TABLE "users" (
    "uid" UUID NOT NULL,
    "username" VARCHAR(63) NOT NULL,
    "email" VARCHAR(127) NOT NULL,
    "nickname" VARCHAR(63) NOT NULL,
    "password" TEXT NOT NULL,
    "totpSecret" CHAR(31) NULL,
    "banned" BOOLEAN DEFAULT false,
    "admin" BOOLEAN DEFAULT false,
    PRIMARY KEY ("uid")
);

CREATE TABLE "user_passkeys" (
    "id" SERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "passkeySecret" TEXT NOT NULL,
    PRIMARY KEY ("id"),
    FOREIGN KEY ("uid") REFERENCES "users" ("uid")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);