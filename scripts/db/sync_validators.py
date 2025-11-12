#!/usr/bin/env python3
"""
Synchronise MongoDB collection validators with the Mongoose models.

Running this script regenerates:
  1. apply_validators_commands.json  (collMod commands for Atlas)
  2. ../bridges_physiotherapy_services_db_admin/schema.json  (admin copy)

Usage:
  python scripts/db/sync_validators.py
"""
from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Iterable, List

ROOT = Path(__file__).resolve().parents[2]
ADMIN_SCHEMA_PATH = ROOT.parent / "bridges_physiotherapy_services_db_admin" / "schema.json"
COMMANDS_PATH = ROOT / "apply_validators_commands.json"

NUMERIC_TYPES = ["int", "long", "double", "decimal"]


def _with_null(values: Iterable[str]) -> List[str]:
  return list(dict.fromkeys([*values, "null"]))


def number_type(nullable: bool = False) -> Dict[str, Any]:
  types = NUMERIC_TYPES if not nullable else _with_null(NUMERIC_TYPES)
  return {"bsonType": types}


def string_type(nullable: bool = False) -> Dict[str, Any]:
  return {"bsonType": "string"} if not nullable else {"bsonType": ["string", "null"]}


def bool_type(nullable: bool = False) -> Dict[str, Any]:
  return {"bsonType": "bool"} if not nullable else {"bsonType": ["bool", "null"]}


def date_type(nullable: bool = False) -> Dict[str, Any]:
  return {"bsonType": "date"} if not nullable else {"bsonType": ["date", "null"]}


def object_id(nullable: bool = False) -> Dict[str, Any]:
  return {"bsonType": "objectId"} if not nullable else {"bsonType": ["objectId", "null"]}


def array_of(item_schema: Dict[str, Any]) -> Dict[str, Any]:
  return {"bsonType": "array", "items": deepcopy(item_schema)}


CLINICAL_NOTE_SCHEMA = {
    "bsonType": "object",
    "properties": {
        "author": object_id(True),
        "note": string_type(),
        "createdAt": date_type(True),
    },
    "additionalProperties": True,
}

LINE_ITEM_SCHEMA = {
    "bsonType": "object",
    "properties": {
        "line_id": string_type(),
        "description": string_type(),
        "quantity": number_type(),
        "unit_price": number_type(),
        "discount_amount": number_type(True),
        "total": number_type(),
        "appointment_id": number_type(True),
        "service_date": date_type(True),
        "meta": string_type(True),
        "notes": string_type(True),
    },
    "additionalProperties": True,
}

TREATMENT_SLOT_SCHEMA = {
    "bsonType": "object",
    "properties": {
        "day_of_week": number_type(),
        "start_time": string_type(),
        "end_time": string_type(),
        "location": string_type(True),
    },
    "required": ["day_of_week", "start_time", "end_time"],
    "additionalProperties": True,
}

TREATMENT_NOTE_ATTACHMENT = {
    "bsonType": "object",
    "properties": {
        "fileName": string_type(True),
        "fileUrl": string_type(True),
    },
    "additionalProperties": True,
}

SCHEMAS: Dict[str, Dict[str, Any]] = {
    "users": {
        "bsonType": "object",
        "required": ["username", "password", "role", "active"],
        "properties": {
            "_id": object_id(),
            "username": string_type(),
            "email": string_type(True),
            "password": string_type(),
            "role": {"bsonType": "string", "enum": ["admin", "therapist", "receptionist"]},
            "employeeID": number_type(True),
            "administrator": bool_type(),
            "active": bool_type(),
            "lastLoginAt": date_type(True),
            "failedLoginAttempts": number_type(True),
            "lockedAt": date_type(True),
            "passwordResetToken": string_type(True),
            "passwordResetExpires": date_type(True),
            "twoFactorEnabled": bool_type(),
            "twoFactorSecret": string_type(True),
            "twoFactorTempSecret": string_type(True),
            "twoFactorVerifiedAt": date_type(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "patients": {
        "bsonType": "object",
        "required": ["patient_id", "first_name", "surname", "email", "phone"],
        "properties": {
            "_id": object_id(),
            "patient_id": number_type(),
            "first_name": string_type(),
            "surname": string_type(),
            "preferred_name": string_type(True),
            "date_of_birth": date_type(True),
            "gender": {
                "bsonType": "string",
                "enum": ["female", "male", "non-binary", "other", "unknown"],
            },
            "email": string_type(),
            "phone": string_type(),
            "secondary_phone": string_type(True),
            "primary_contact_name": string_type(True),
            "primary_contact_email": string_type(True),
            "primary_contact_phone": string_type(True),
            "address": {"bsonType": ["object", "null"]},
            "emergency_contact": {"bsonType": ["object", "null"]},
            "insurance": {"bsonType": ["object", "null"]},
            "medical_alerts": array_of(string_type()),
            "primary_therapist_id": number_type(True),
            "primaryTherapist": object_id(True),
            "status": {"bsonType": "string", "enum": ["active", "inactive", "archived"]},
            "tags": array_of(string_type()),
            "billing_mode": {"bsonType": "string", "enum": ["individual", "monthly"]},
            "consent_signed_at": date_type(True),
            "notes_summary": string_type(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "appointments": {
        "bsonType": "object",
        "required": [
            "appointment_id",
            "patient_id",
            "employeeID",
            "date",
            "location",
            "first_name",
            "surname",
            "contact",
            "treatment_id",
            "treatment_description",
            "treatment_count",
            "price",
        ],
        "properties": {
            "_id": object_id(),
            "appointment_id": number_type(),
            "series_id": string_type(True),
            "patient_id": number_type(),
            "patient": object_id(True),
            "employeeID": number_type(),
            "therapist": object_id(True),
            "date": date_type(),
            "duration_minutes": number_type(True),
            "location": string_type(),
            "room": string_type(True),
            "first_name": string_type(),
            "surname": string_type(),
            "contact": string_type(),
            "completed": bool_type(),
            "status": {
                "bsonType": "string",
                "enum": ["scheduled", "completed", "cancelled", "cancelled_same_day", "other"],
            },
            "completion_status": {
                "bsonType": "string",
                "enum": [
                    "scheduled",
                    "completed",
                    "completed_manual",
                    "cancelled_same_day",
                    "cancelled_reschedule",
                    "other",
                ],
            },
            "completion_note": string_type(True),
            "cancellation_reason": string_type(True),
            "cancelled_at": date_type(True),
            "treatment_id": number_type(),
            "treatment_description": string_type(),
            "treatment_count": number_type(),
            "price": number_type(),
            "recurrence": {"bsonType": ["object", "null"]},
            "treatment_notes": string_type(True),
            "billing_mode": {"bsonType": "string", "enum": ["individual", "monthly"]},
            "clinical_notes": array_of(CLINICAL_NOTE_SCHEMA),
            "createdBy": object_id(True),
            "updatedBy": object_id(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "invoices": {
        "bsonType": "object",
        "required": ["invoice_number", "patient_id", "subtotal", "total_due", "balance_due"],
        "properties": {
            "_id": object_id(),
            "invoice_id": number_type(True),
            "invoice_number": string_type(),
            "patient_id": number_type(),
            "client_id": number_type(True),
            "appointment_id": number_type(True),
            "appointment_ids": array_of(number_type()),
            "patient": object_id(True),
            "billing_contact_name": string_type(True),
            "billing_contact_email": string_type(True),
            "billing_contact_phone": string_type(True),
            "status": {
                "bsonType": "string",
                "enum": ["draft", "sent", "partially_paid", "paid", "void"],
            },
            "line_items": array_of(LINE_ITEM_SCHEMA),
            "totals": {"bsonType": ["object", "null"]},
            "subtotal": number_type(),
            "discount": {"bsonType": ["object", "null"]},
            "total_due": number_type(),
            "total_paid": number_type(True),
            "balance_due": number_type(),
            "issue_date": date_type(True),
            "due_date": date_type(True),
            "sent_at": date_type(True),
            "paid_at": date_type(True),
            "pdf_path": string_type(True),
            "pdf_url": string_type(True),
            "pdf_generated_at": date_type(True),
            "html_snapshot": string_type(True),
            "currency": string_type(True),
            "notes": string_type(True),
            "createdBy": object_id(True),
            "updatedBy": object_id(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "payments": {
        "bsonType": "object",
        "required": ["payment_id", "patient_id", "amount_paid"],
        "properties": {
            "_id": object_id(),
            "payment_id": number_type(),
            "invoice_id": number_type(True),
            "invoice_number": string_type(True),
            "patient_id": number_type(),
            "appointment_id": number_type(True),
            "treatment_id": number_type(True),
            "treatment_description": string_type(True),
            "amount_paid": number_type(),
            "currency": string_type(True),
            "payment_date": date_type(True),
            "method": {
                "bsonType": "string",
                "enum": ["card", "cash", "transfer", "insurance", "other"],
            },
            "reference": string_type(True),
            "status": {
                "bsonType": "string",
                "enum": ["applied", "pending", "failed", "refunded"],
            },
            "notes": string_type(True),
            "recordedBy": object_id(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "services": {
        "bsonType": "object",
        "required": ["treatment_id", "treatment_description", "price"],
        "properties": {
            "_id": object_id(),
            "treatment_id": number_type(),
            "treatment_description": string_type(),
            "price": number_type(),
            "duration_minutes": number_type(True),
            "active": bool_type(),
            "notes": string_type(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "notes": {
        "bsonType": "object",
        "required": ["patient_id", "note"],
        "properties": {
            "_id": object_id(),
            "patient_id": number_type(),
            "appointment_id": number_type(True),
            "employeeID": number_type(True),
            "author": object_id(True),
            "type": {
                "bsonType": "string",
                "enum": ["treatment", "communication", "administrative"],
            },
            "note": string_type(),
            "visibility": {"bsonType": "string", "enum": ["private", "team", "admin"]},
            "date": date_type(True),
            "attachments": array_of(TREATMENT_NOTE_ATTACHMENT),
            "createdBy": object_id(True),
            "updatedBy": object_id(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "auditlogs": {
        "bsonType": "object",
        "required": ["event"],
        "properties": {
            "_id": object_id(),
            "event": string_type(),
            "user": object_id(True),
            "user_role": string_type(True),
            "actor": object_id(True),
            "actor_role": string_type(True),
            "ip_address": string_type(True),
            "metadata": {"bsonType": ["object", "null"]},
            "success": bool_type(),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "communications": {
        "bsonType": "object",
        "required": ["communication_id", "patient_id", "type", "content"],
        "properties": {
            "_id": object_id(),
            "communication_id": number_type(),
            "patient_id": number_type(),
            "patient": object_id(True),
            "employeeID": number_type(True),
            "user": object_id(True),
            "date": date_type(True),
            "type": {"bsonType": "string", "enum": ["email", "sms", "phone", "in_person", "note"]},
            "subject": string_type(True),
            "content": string_type(),
            "delivery_status": {
                "bsonType": "string",
                "enum": ["pending", "sent", "delivered", "failed"],
            },
            "metadata": {"bsonType": ["object", "null"]},
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "clinicsettings": {
        "bsonType": "object",
        "properties": {
            "_id": object_id(),
            "branding": {"bsonType": ["object", "null"]},
            "invoice_prefix": string_type(True),
            "email_provider": {
                "bsonType": "string",
                "enum": ["sendgrid", "postmark", "smtp", "none"],
            },
            "email_templates": array_of({"bsonType": "object", "additionalProperties": True}),
            "notification_preferences": {"bsonType": ["object", "null"]},
            "updatedBy": object_id(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "datasubjectrequests": {
        "bsonType": "object",
        "required": ["request_id", "patient_id", "type", "dueAt", "requesterName"],
        "properties": {
            "_id": object_id(),
            "request_id": number_type(),
            "patient_id": number_type(),
            "type": {
                "bsonType": "string",
                "enum": ["access", "rectification", "erasure", "restriction", "portability"],
            },
            "status": {
                "bsonType": "string",
                "enum": ["open", "in_progress", "fulfilled", "rejected"],
            },
            "requesterName": string_type(),
            "requesterEmail": string_type(True),
            "receivedAt": date_type(True),
            "dueAt": date_type(),
            "completedAt": date_type(True),
            "handledBy": object_id(True),
            "notes": string_type(True),
            "history": array_of({"bsonType": "object", "additionalProperties": True}),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "refreshtokens": {
        "bsonType": "object",
        "required": ["user", "tokenId", "expiresAt"],
        "properties": {
            "_id": object_id(),
            "user": object_id(),
            "tokenId": string_type(),
            "expiresAt": date_type(),
            "revokedAt": date_type(True),
            "replacedByTokenId": string_type(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "counters": {
        "bsonType": "object",
        "required": ["key"],
        "properties": {
            "_id": object_id(),
            "key": string_type(),
            "value": number_type(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "therapistavailabilities": {
        "bsonType": "object",
        "required": ["therapist", "therapist_employee_id", "effective_from"],
        "properties": {
            "_id": object_id(),
            "therapist": object_id(),
            "therapist_employee_id": number_type(),
            "slots": array_of(TREATMENT_SLOT_SCHEMA),
            "effective_from": date_type(),
            "effective_to": date_type(True),
            "is_default": bool_type(),
            "notes": string_type(True),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "treatment_note_templates": {
        "bsonType": "object",
        "required": ["name", "body", "createdBy", "updatedBy"],
        "properties": {
            "_id": object_id(),
            "name": string_type(),
            "body": string_type(),
            "tags": array_of(string_type()),
            "createdBy": object_id(),
            "updatedBy": object_id(),
            "archived": bool_type(),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
    "profit_loss_entries": {
        "bsonType": "object",
        "required": ["date", "type", "amount", "createdBy", "updatedBy"],
        "properties": {
            "_id": object_id(),
            "entry_id": number_type(True),
            "date": date_type(),
            "type": {"bsonType": "string", "enum": ["income", "expense"]},
            "category": string_type(True),
            "description": string_type(True),
            "amount": number_type(),
            "source": {"bsonType": "string", "enum": ["manual", "invoice"]},
            "invoice_number": string_type(True),
            "invoice_id": object_id(True),
            "createdBy": object_id(),
            "updatedBy": object_id(),
            "createdAt": date_type(True),
            "updatedAt": date_type(True),
        },
        "additionalProperties": True,
    },
}


def build_collmod_commands() -> List[Dict[str, Any]]:
  commands = []
  for collection, schema in SCHEMAS.items():
    commands.append({
        "collMod": collection,
        "validator": {"$jsonSchema": schema},
        "validationLevel": "moderate",
        "validationAction": "error",
    })
  return commands


TYPE_MAP = {
    "bool": "boolean",
    "string": "string",
    "object": "object",
    "array": "array",
    "objectId": "string",
    "date": "string",
    "int": "number",
    "long": "number",
    "double": "number",
    "decimal": "number",
    "null": "null",
}


def convert_bson_schema(node: Any) -> Any:
  if isinstance(node, dict):
    result: Dict[str, Any] = {}
    bson_type = node.get("bsonType")
    if bson_type is not None:
      types = bson_type if isinstance(bson_type, list) else [bson_type]
      converted = []
      needs_pattern = False
      needs_format = False
      for entry in types:
        if entry == "objectId":
          needs_pattern = True
        if entry == "date":
          needs_format = True
        converted.append(TYPE_MAP.get(entry, entry))
      if len(converted) == 1:
        result["type"] = converted[0]
      else:
        result["type"] = converted
      if needs_pattern:
        result.setdefault("pattern", "^[a-fA-F0-9]{24}$")
      if needs_format:
        result.setdefault("format", "date-time")
    for key, value in node.items():
      if key == "bsonType":
        continue
      if key == "properties":
        result["properties"] = {prop: convert_bson_schema(schema) for prop, schema in value.items()}
      elif key == "items":
        result["items"] = (
            [convert_bson_schema(item) for item in value]
            if isinstance(value, list)
            else convert_bson_schema(value)
        )
      else:
        result[key] = convert_bson_schema(value)
    return result
  if isinstance(node, list):
    return [convert_bson_schema(item) for item in node]
  return node


def main() -> None:
  commands = build_collmod_commands()
  COMMANDS_PATH.write_text(json.dumps(commands, indent=2), encoding="utf-8")

  schema_doc = {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "title": "Bridges Physiotherapy Database Schemas",
      "type": "object",
      "properties": {name: convert_bson_schema(schema) for name, schema in SCHEMAS.items()},
  }
  ADMIN_SCHEMA_PATH.write_text(json.dumps(schema_doc, indent=2), encoding="utf-8")

  print(f"Wrote {len(commands)} collMod commands to {COMMANDS_PATH}")
  print(f"Updated {ADMIN_SCHEMA_PATH}")


if __name__ == "__main__":
  main()
