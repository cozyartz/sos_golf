# Physical network and manufacturing boundary

State of Stick Golf is software for a physical golf network. It does not
pretend that a database row is a manufactured product, or that a concept image
is evidence of a course installation.

## The physical product

The product direction is a family of small, durable StickLink touchpoints that
can be placed where golfers already make decisions:

- flagstick or cup markers;
- numbered tee markers;
- cart and bag tags;
- halfway-house and service markers;
- pro-shop and clubhouse identifiers;
- tournament, sponsor, or event signs;
- course emblems and collectible physical proofs.

The object should be easy to understand, easy to maintain, and appropriate to
the course. Material and attachment choices are manufacturing decisions. A
typical review considers weather, UV exposure, impact, water, cleaning,
readability, NFC/RFID behavior, vandalism, replacement cost, and installation
labor.

## The production loop

```text
brief → design → prototype → material / finish review → encoding
     → installation → operator approval → touchpoint registration
     → golfer interaction → verified golf record
```

The application begins at touchpoint registration. It can associate a stable
physical identifier with a course, hole, service, event, approved destination,
and organization context. It can record taps and verification events with an
audit trail. It does not choose a vendor, purchase materials, certify a part,
or prove that installation happened.

## Why the physical layer matters

The marker is not the product by itself. It is a low-friction interface between
the real course and the authorized digital context behind it. A golfer can tap
to open the next useful action — for example, see hole information, confirm a
round moment, request an approved service, save a memory, or enter an event
experience.

For the operator, the same interaction can become a permissioned record of
participation or service demand. For the golfer, it can become part of a
portable passport. For State of Stick, it is an instance of physical identity
and attribution governed by the private platform layer.

## Boundary with the private platform

Golf stores golf-specific references and events. The private State of Stick
platform remains authoritative for the physical identity system, person and
organization identity, roles, entitlements, commerce, payments, attribution,
and policy. Do not copy private platform implementation into this repository.

## Current status

This repository contains the digital pilot, mock/demo surfaces, domain models,
API contracts, and artwork needed to explain the concept. It does not prove a
manufacturing run, live NFC deployment, course partnership, sponsor campaign,
or production adoption. Those claims require separate evidence from approved
operators, manufacturing partners, and the State of Stick platform.
