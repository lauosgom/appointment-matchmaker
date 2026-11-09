# Functional Scope of the MVP

## Appointment Scheduling Tool with Specialists --- Telephone of Hope

**Version:** Consolidated Draft
**Purpose:** To define the first functional version of a tool
for checking availability and managing assignments and appointments with
specialists, without integration with Llamatel.

------------------------------------------------------------------------

## 1. Objective and Scope

The tool will allow counselors to check specialists'
available slots and manage assignments that may
remain pending confirmation. An assignment can be definitively confirmed
by the counselor who initiated it or by an administrator.

The first version will be developed **without integration with Llamatel and without
recording the crisis call**. The reason for the
crisis will not be stored.

### Included in the MVP

- Username and password login.

- Administrator, counselor, and specialist profiles.

- Management of users, specialists, departments, areas of intervention, and availability.

- Search for appointment slots by specialist, department, or area of ​​intervention.

- Appointments pending confirmation.

- Final confirmation and appointment code generation.

- Discarding pending appointments.

- Administrative cancellation of confirmed appointments.

- View appointments and assignments by profile.

- Operational history of canceled appointments and discarded assignments.

- Password recovery via email.

- Clear messages to inform users of errors and provide guidance.

### Outside the MVP

- Integration with Llamatel.

- Recording or transcription of crisis calls.

- Recording the reason for the crisis.

- Sending automatic emails to confirm appointments.

- Visual calendar; appointments will initially be displayed in lists.

- Functionality for specialists to modify appointments or manage their availability.

- Function to mark an appointment as completed.

- Detailed audit history of access and operations.
- Detailed definition of security and data protection requirements, which will be addressed in a later phase.

------------------------------------------------------------------------

## 2. Profiles and Permissions

### 2.1 Administrator

Can:

- Create, modify, and deactivate user accounts.

- Assign profiles and set an initial password.

- Manage specialists, departments, and areas of intervention.

- Manage availability slots.

- Configure the overall duration of appointments.

- Configure the two letters corresponding to each year for appointment codes.

- View assignments and appointments, with filters by specialist and status.

- Confirm pending assignments.

- Discard pending assignments, indicating the reason.

- Cancel confirmed appointments, indicating the reason.

- Start a new assignment from a canceled appointment, using the pre-loaded name and mobile number, if available.

### 2.2 Consultant

Can:

- Search availability by specialist, department, or area of ​​intervention.

- Check upcoming schedules or search for a specific date.

- Start an assignment.

- Review the details before saving the assignment.

- Confirm an assignment you started.

- Discard a pending assignment you started, indicating the reason.

- View all confirmed appointments, filtered by specialist.

- View the assignments you started, regardless of their status,

ordered from most recent to oldest.

- Request a correction to a confirmed appointment from the administrator.

You cannot directly cancel a confirmed appointment.

### 2.3 Specialist

Can:

- View your own confirmed appointments.

- View upcoming appointments and those for the current day.

- View your appointment history with past dates.

You cannot modify or cancel appointments, confirm or discard assignments, or manage your availability schedule.

------------------------------------------------------------------------

## 3. Login and Accounts

- Access will be via **username and password**.

- The administrator will create the accounts, assign the profile, and
set the initial password.

- The administrator can deactivate an account. A deactivated account
will not be able to log in to the system, but historical transactions
will retain the reference to the user who performed them.

- If several login attempts are unsuccessful, the
system will temporarily block access for **5 minutes**.

- Password recovery will be included via a link sent to the user's
email address.

- Automated emails will be used only for password recovery; appointment confirmations will not be sent by email.

----------------------------------------------------------------------