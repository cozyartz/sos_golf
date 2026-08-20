# Connected Tee Times

Connected Tee Times is an integration layer, not a replacement tee sheet.
Courses keep their existing reservation and payment system. State of Stick
receives a reservation reference and attaches a secure, course-specific
pre-round experience to it.

## First workflow

1. An operator or approved connector imports a tee-time reference.
2. Golf creates a random activation token and stores only its SHA-256 hash.
3. The operator sends the golfer-facing activation URL through the course's
   existing booking confirmation or reminder flow. The URL resolves to
   `/tee-time/activate/?token=...` on the Golf site; the page calls the public
   lookup endpoint behind the scenes.
4. The golfer resolves the URL to see the course, start time, player count, and
   approved next steps without exposing reservation ownership or payment data.
5. An authenticated State of Stick identity session claims a player slot,
   starts a round, and connects scoring, services, leagues, and Golf Agent
   context.

The public activation response does not expose golfer names, phone numbers,
payment details, or the external reservation identifier. Reservation ownership,
identity assignment, and consequential status changes require an authenticated
golfer session. The current Worker still uses the repository's temporary write
authentication seam; production deployment must replace that seam with the
State of Stick identity adapter before broad access is enabled.

The activation page is intentionally `noindex` because its token is a private
handoff from a course's booking flow, not a public course landing page.

## Claim and start

After resolving an activation URL, an authenticated golfer can claim one player
slot with:

`POST /api/v1/tee-time-activations/:token/claim`

```json
{ "playerIndex": 1 }
```

The golfer can then start a round with:

`POST /api/v1/tee-time-activations/:token/start-round`

```json
{ "playerIndex": 1, "format": "stroke_play", "teeSetId": "cedar-blue" }
```

The round is created as `in_progress` and keeps a reference to the tee-time
reservation. Scores, service requests, taps, and league context can use that
round reference without taking ownership of booking availability or payment.

## Import contract

`POST /api/v1/courses/:courseId/tee-times/import` accepts a bounded batch of
reservations from an operator-authorized connector:

```json
{
  "sourceSystem": "existing-tee-sheet",
  "reservations": [
    {
      "externalReservationId": "booking-123",
      "startsAt": "2026-09-01T13:30:00Z",
      "playerCount": 4,
      "status": "reserved",
      "bookingUrl": "https://example-course.test/booking/123"
    }
  ]
}
```

The import is idempotent for `(course, sourceSystem, externalReservationId)`.
It does not change the course's tee sheet, collect payment, or claim that a
reservation is valid beyond the source system's supplied status.

Operators can review imported reservations with:

`GET /api/v1/courses/:courseId/tee-times?date=2026-09-01&status=checked_in`

That view includes claimed player slots and linked round IDs, but does not
change the external reservation. It is the starting point for the operator
dashboard's arrivals, check-in, service, and tee-time analytics views.

Operators can change a reservation state with:

`POST /api/v1/tee-times/:teeTimeId/status`

Allowed transitions are controlled by the server: reserved → activated →
checked in → completed, with cancellation/no-show exits where appropriate.
Every transition records both a tee-time event and an operator audit event.

When a golfer requests an approved food, beverage, or player service during a
bound round, the service request retains the same tee-time reservation ID. The
course can therefore measure service activity by booked group without exposing
the external reservation identifier to the golfer.
