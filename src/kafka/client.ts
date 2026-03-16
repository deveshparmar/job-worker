import { Kafka } from "kafkajs";
import { config } from "../config/index.js";

export const kafka = new Kafka({
    brokers: [config.KAFKA_BROKER || "localhost:9092"],
})

export const producer = kafka.producer();

export const consumer = kafka.consumer({
    groupId: config.KAFKA_GROUP_ID || "job-workers",
    allowAutoTopicCreation: true,
})