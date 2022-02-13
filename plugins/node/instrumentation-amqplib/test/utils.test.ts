import "mocha";
import * as expect from "expect";
import { getConnectionAttributesFromServer, getConnectionAttributesFromUrl } from "../src/utils";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import * as amqp from "amqplib";
import { rabbitMqUrl } from "./utils";

describe("utils", function () {
  describe("getConnectionAttributesFromServer", function () {

    let conn: amqp.Connection;
    before(async () => {
        conn = await amqp.connect(rabbitMqUrl);
    });
    after(async () => {
        await conn.close();
    });

    it("messaging system attribute", function () {
      const attributes = getConnectionAttributesFromServer(conn.connection);
      expect(attributes).toStrictEqual({
          [SemanticAttributes.MESSAGING_SYSTEM]: 'rabbitmq',
      });
    });
  });

  describe("getConnectionAttributesFromUrl", function () {
    it("all features", function () {
      const attributes = getConnectionAttributesFromUrl(
        `amqp://user:pass@host:10000/vhost`
      );
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: "AMQP",
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.NET_PEER_NAME]: "host",
        [SemanticAttributes.NET_PEER_PORT]: 10000,
        [SemanticAttributes.MESSAGING_URL]: `amqp://user:***@host:10000/vhost`,
      });
    });

    it("all features encoded", function () {
      const attributes = getConnectionAttributesFromUrl(
        `amqp://user%61:%61pass@ho%61st:10000/v%2fhost`
      );
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: "AMQP",
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.NET_PEER_NAME]: "ho%61st",
        [SemanticAttributes.NET_PEER_PORT]: 10000,
        [SemanticAttributes.MESSAGING_URL]: `amqp://user%61:***@ho%61st:10000/v%2fhost`,
      });
    });

    it("only protocol", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: "AMQP",
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.NET_PEER_NAME]: "localhost",
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: `amqp://`,
      });
    });

    it("empty username and password", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://:@/`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.MESSAGING_URL]: `amqp://:***@/`,
      });
    });

    it("username and no password", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://user@`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.MESSAGING_URL]: `amqp://user@`,
      });
    });

    it("username and password, no host", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://user:pass@`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.MESSAGING_URL]: `amqp://user:***@`,
      });
    });

    it("host only", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://host`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: "AMQP",
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.NET_PEER_NAME]: "host",
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: `amqp://host`,
      });
    });

    it("port only", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://:10000`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.MESSAGING_URL]: `amqp://:10000`,
      });
    });

    it("vhost only", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp:///vhost`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: "AMQP",
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.NET_PEER_NAME]: "localhost",
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: `amqp:///vhost`,
      });
    });

    it("host only, trailing slash", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://host/`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: "AMQP",
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.NET_PEER_NAME]: "host",
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: `amqp://host/`,
      });
    });

    it("vhost encoded", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://host/%2f`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: "AMQP",
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.NET_PEER_NAME]: "host",
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: `amqp://host/%2f`,
      });
    });

    it("IPv6 host", function () {
      const attributes = getConnectionAttributesFromUrl(`amqp://[::1]`);
      expect(attributes).toStrictEqual({
        [SemanticAttributes.MESSAGING_PROTOCOL]: "AMQP",
        [SemanticAttributes.MESSAGING_PROTOCOL_VERSION]: "0.9.1",
        [SemanticAttributes.NET_PEER_NAME]: "[::1]",
        [SemanticAttributes.NET_PEER_PORT]: 5672,
        [SemanticAttributes.MESSAGING_URL]: `amqp://[::1]`,
      });
    });
  });
});
