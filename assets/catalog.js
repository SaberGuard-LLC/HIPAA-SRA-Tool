/* ============================================================================
   SaberGuard HIPAA SRA — Security Rule catalog and rating scales
   45 CFR Part 164, Subpart C (§§164.308, 164.310, 164.312, 164.314, 164.316)
   ========================================================================== */

const CATEGORIES = {
  administrative: { label: 'Administrative safeguards', cite: '45 CFR §164.308', short: 'Administrative' },
  physical:       { label: 'Physical safeguards',       cite: '45 CFR §164.310', short: 'Physical' },
  technical:      { label: 'Technical safeguards',      cite: '45 CFR §164.312', short: 'Technical' },
  organization:   { label: 'Organizational requirements', cite: '45 CFR §164.314', short: 'Organizational' },
  documentation:  { label: 'Policies, procedures & documentation', cite: '45 CFR §164.316', short: 'Documentation' }
};

/* id, category, title, requirement, assessor prompt, citation, type */
const CONTROLS = [
['A01','administrative','Security management process','Implement policies and procedures to prevent, detect, contain, and correct security violations.','Confirm the program operates across the full assessed environment.','164.308(a)(1)','Standard'],
['A02','administrative','Risk analysis','Conduct an accurate and thorough assessment of potential risks and vulnerabilities to ePHI.','Verify scope, data flows, threats, vulnerabilities, existing controls, likelihood, impact, and conclusions.','164.308(a)(1)(ii)(A)','Required'],
['A03','administrative','Risk management','Implement measures sufficient to reduce risks and vulnerabilities to a reasonable and appropriate level.','Trace analyzed risks to treatment, owners, dates, validation, and acceptance.','164.308(a)(1)(ii)(B)','Required'],
['A04','administrative','Sanction policy','Apply appropriate sanctions against workforce members who fail to comply with security policies.','Review the approved policy and de-identified evidence of consistent application.','164.308(a)(1)(ii)(C)','Required'],
['A05','administrative','Information system activity review','Regularly review records of information system activity, including audit logs, access reports, and incident tracking.','Identify responsible reviewers, coverage, frequency, escalation, and retained evidence.','164.308(a)(1)(ii)(D)','Required'],
['A06','administrative','Assigned security responsibility','Identify the security official responsible for developing and implementing required policies and procedures.','Confirm formal assignment, authority, role description, and accountability.','164.308(a)(2)','Standard'],
['A07','administrative','Workforce security','Ensure workforce members have appropriate ePHI access and prevent access by those without authorization.','Test the control across employees, volunteers, contractors, and other workforce members.','164.308(a)(3)','Standard'],
['A08','administrative','Authorization and/or supervision','Implement authorization or supervision procedures for workforce members who work with ePHI or in locations where it may be accessed.','Sample approvals and supervision for new, temporary, transferred, and remote workers.','164.308(a)(3)(ii)(A)','Addressable'],
['A09','administrative','Workforce clearance procedure','Determine whether workforce access to ePHI is appropriate.','Review role criteria, screening where appropriate, approvals, and periodic reevaluation.','164.308(a)(3)(ii)(B)','Addressable'],
['A10','administrative','Termination procedures','Terminate ePHI access when employment or another workforce arrangement ends.','Sample timely account, badge, key, device, token, and remote-access revocation.','164.308(a)(3)(ii)(C)','Addressable'],
['A11','administrative','Information access management','Authorize access to ePHI consistently with the Privacy Rule.','Confirm least-privilege governance covers all systems, facilities, and support access.','164.308(a)(4)','Standard'],
['A12','administrative','Isolating health care clearinghouse functions','Protect clearinghouse ePHI from access by the larger organization when applicable.','Document applicability; if applicable, verify technical and organizational separation.','164.308(a)(4)(ii)(A)','Required'],
['A13','administrative','Access authorization','Implement policies for granting access to ePHI, including through workstations, transactions, programs, processes, or other mechanisms.','Sample requests, approvals, role mappings, privileged access, and emergency access.','164.308(a)(4)(ii)(B)','Addressable'],
['A14','administrative','Access establishment and modification','Implement policies that establish, document, review, and modify access rights.','Test joins, transfers, elevated access, recertification, and removals.','164.308(a)(4)(ii)(C)','Addressable'],
['A15','administrative','Security awareness and training','Implement a security awareness and training program for all workforce members, including management.','Confirm onboarding, periodic training, role-based content, completion, and follow-up.','164.308(a)(5)','Standard'],
['A16','administrative','Security reminders','Provide periodic security updates.','Review cadence, topics, delivery channels, and retained communications.','164.308(a)(5)(ii)(A)','Addressable'],
['A17','administrative','Protection from malicious software','Use procedures for guarding against, detecting, and reporting malicious software.','Review endpoint/email defenses, updates, alert handling, user reporting, and coverage.','164.308(a)(5)(ii)(B)','Addressable'],
['A18','administrative','Log-in monitoring','Monitor log-in attempts and report discrepancies.','Inspect authentication logging, alert thresholds, investigation, and escalation.','164.308(a)(5)(ii)(C)','Addressable'],
['A19','administrative','Password management','Create, change, and safeguard passwords through documented procedures.','Review identity standards, compromised-password response, MFA, vaulting, and service accounts.','164.308(a)(5)(ii)(D)','Addressable'],
['A20','administrative','Security incident procedures','Implement policies and procedures to address security incidents.','Verify scope, roles, contacts, triage, legal/privacy coordination, and exercises.','164.308(a)(6)','Standard'],
['A21','administrative','Response and reporting','Identify and respond to suspected or known incidents; mitigate harmful effects; document incidents and outcomes.','Sample tickets or exercises from detection through lessons learned.','164.308(a)(6)(ii)','Required'],
['A22','administrative','Contingency plan','Establish policies and procedures for emergencies that damage systems containing ePHI.','Confirm the plan addresses cyber, technology, utility, facility, and regional events.','164.308(a)(7)','Standard'],
['A23','administrative','Data backup plan','Establish and implement procedures to create and maintain retrievable exact copies of ePHI.','Inspect scope, monitoring, encryption, isolation, retention, failures, and restore results.','164.308(a)(7)(ii)(A)','Required'],
['A24','administrative','Disaster recovery plan','Establish procedures to restore lost data.','Verify recovery steps, dependencies, responsibilities, recovery objectives, and testing.','164.308(a)(7)(ii)(B)','Required'],
['A25','administrative','Emergency mode operation plan','Enable continuation of critical business processes while protecting ePHI during emergency operations.','Review downtime workflows, minimum security controls, alternate sites, and communications.','164.308(a)(7)(ii)(C)','Required'],
['A26','administrative','Testing and revision procedures','Periodically test and revise contingency plans.','Review exercise dates, scenarios, participants, results, corrective actions, and retesting.','164.308(a)(7)(ii)(D)','Addressable'],
['A27','administrative','Applications and data criticality analysis','Assess the relative criticality of applications and data for contingency planning.','Reconcile business impact results to recovery tiers, RTOs, RPOs, and dependencies.','164.308(a)(7)(ii)(E)','Addressable'],
['A28','administrative','Evaluation','Perform periodic technical and nontechnical evaluations in response to environmental or operational changes affecting ePHI security.','Review evaluation cadence, change triggers, scope, independence, findings, and follow-up.','164.308(a)(8)','Standard'],
['A29','administrative','Business associate contracts and arrangements','Obtain satisfactory assurances that business associates appropriately safeguard ePHI.','Reconcile ePHI vendors to executed agreements, due diligence, monitoring, and termination.','164.308(b)(1)','Standard'],
['P01','physical','Facility access controls','Limit physical access to electronic information systems and facilities while ensuring authorized access.','Review all offices, server rooms, records areas, colocations, and remote work locations.','164.310(a)(1)','Standard'],
['P02','physical','Contingency operations','Allow facility access supporting data restoration and emergency-mode operations under the contingency plan.','Validate emergency authorization, alternate access, and restoration-site procedures.','164.310(a)(2)(i)','Addressable'],
['P03','physical','Facility security plan','Safeguard facilities and equipment from unauthorized physical access, tampering, and theft.','Inspect boundaries, locks, badges, alarms, cameras, server rooms, and response.','164.310(a)(2)(ii)','Addressable'],
['P04','physical','Access control and validation procedures','Control and validate facility access based on role or function, including visitor control and software testing areas.','Sample access lists, visitor logs, approvals, reviews, and revoked access.','164.310(a)(2)(iii)','Addressable'],
['P05','physical','Maintenance records','Document repairs and modifications to physical security components.','Review records for locks, doors, walls, cameras, alarms, and related hardware.','164.310(a)(2)(iv)','Addressable'],
['P06','physical','Workstation use','Specify proper workstation functions, manner of use, and physical attributes of surroundings.','Observe clinical, administrative, shared, kiosk, and remote-work settings.','164.310(b)','Standard'],
['P07','physical','Workstation security','Implement physical safeguards restricting access to workstations that access ePHI.','Check placement, privacy, locking, secure rooms, unattended use, and portable devices.','164.310(c)','Standard'],
['P08','physical','Device and media controls','Govern receipt and removal of hardware and electronic media containing ePHI, and their movement within facilities.','Verify the lifecycle from acquisition and inventory through transfer and destruction.','164.310(d)(1)','Standard'],
['P09','physical','Disposal','Implement policies for final disposal of ePHI and the hardware or media on which it is stored.','Sample destruction certificates, vendor custody, approved methods, and verification.','164.310(d)(2)(i)','Required'],
['P10','physical','Media re-use','Remove ePHI before media is made available for reuse.','Validate sanitization standards, records, verification, and handling of failed media.','164.310(d)(2)(ii)','Required'],
['P11','physical','Accountability','Maintain records of hardware and electronic media movements and the responsible person.','Review inventory accuracy, assignment, transfer, return, and loss investigation.','164.310(d)(2)(iii)','Addressable'],
['P12','physical','Data backup and storage','Create a retrievable exact copy of ePHI before equipment movement when needed.','Sample moves and verify backup decisions, completion, protection, and restoration.','164.310(d)(2)(iv)','Addressable'],
['T01','technical','Access control','Allow access only to persons or software programs granted access rights.','Validate enforcement across applications, infrastructure, databases, endpoints, integrations, and support tools.','164.312(a)(1)','Standard'],
['T02','technical','Unique user identification','Assign a unique name and/or number for identifying and tracking user identity.','Find shared accounts and verify identity lifecycle, traceability, and service-account governance.','164.312(a)(2)(i)','Required'],
['T03','technical','Emergency access procedure','Establish procedures for obtaining necessary ePHI during an emergency.','Test break-glass access, authorization, monitoring, review, and credential availability.','164.312(a)(2)(ii)','Required'],
['T04','technical','Automatic logoff','Terminate electronic sessions after a predetermined period of inactivity.','Validate timeout decisions and configuration by system, device, risk, and workflow.','164.312(a)(2)(iii)','Addressable'],
['T05','technical','Encryption and decryption','Implement a mechanism to encrypt and decrypt ePHI.','Assess ePHI at rest on endpoints, servers, databases, backups, removable media, and cloud services.','164.312(a)(2)(iv)','Addressable'],
['T06','technical','Audit controls','Record and examine activity in systems that contain or use ePHI.','Validate event coverage, identity, timestamps, integrity, retention, alerting, and review.','164.312(b)','Standard'],
['T07','technical','Integrity','Protect ePHI from improper alteration or destruction.','Review authorization, change control, malware protection, backups, and integrity monitoring.','164.312(c)(1)','Standard'],
['T08','technical','Mechanism to authenticate ePHI','Implement electronic mechanisms to corroborate that ePHI has not been altered or destroyed improperly.','Evaluate checksums, signatures, validation rules, reconciliation, and tamper evidence where reasonable.','164.312(c)(2)','Addressable'],
['T09','technical','Person or entity authentication','Verify that a person or entity seeking ePHI access is the one claimed.','Review authentication assurance, MFA, federation, service identities, and identity proofing.','164.312(d)','Standard'],
['T10','technical','Transmission security','Guard against unauthorized access to ePHI transmitted over electronic communications networks.','Map transmission paths including email, portals, APIs, VPN, wireless, fax services, and vendors.','164.312(e)(1)','Standard'],
['T11','technical','Integrity controls for transmission','Ensure electronically transmitted ePHI is not improperly modified without detection.','Assess secure protocols, message integrity, certificates, file validation, and transfer monitoring.','164.312(e)(2)(i)','Addressable'],
['T12','technical','Encryption for transmission','Encrypt ePHI whenever deemed appropriate.','Validate current cryptography and configuration for every internal and external transmission path.','164.312(e)(2)(ii)','Addressable'],
['O01','organization','Business associate contract requirements','Contracts require permitted uses, safeguards, incident reporting, subcontractor protections, return/destruction, and authorization to terminate.','Review agreement language and confirm the operational relationship matches it.','164.314(a)','Standard'],
['O02','organization','Other arrangements','Government entities and covered entities in certain organizational structures use arrangements that satisfy applicable assurances.','Document applicability and review the memorandum, law, or organizational documentation used.','164.314(a)(2)','Standard'],
['O03','organization','Group health plan requirements','Plan documents require the plan sponsor to reasonably and appropriately safeguard ePHI when applicable.','Document applicability and inspect plan amendments, separation, reporting, and access restrictions.','164.314(b)','Standard'],
['D01','documentation','Policies and procedures','Implement reasonable and appropriate policies and procedures that comply with the Security Rule.','Verify that documented requirements match actual operations and current risks.','164.316(a)','Standard'],
['D02','documentation','Documentation','Maintain required policies, procedures, actions, activities, and assessments in written or electronic form.','Confirm the assessment evidence supports conclusions and required actions are recorded.','164.316(b)(1)','Standard'],
['D03','documentation','Time limit','Retain required documentation for six years from creation or last effective date, whichever is later.','Review retention schedules, repositories, disposition controls, and sample availability.','164.316(b)(2)(i)','Required'],
['D04','documentation','Availability','Make documentation available to persons responsible for implementing the procedures to which it pertains.','Validate access, workforce awareness, outage access, and appropriate restrictions.','164.316(b)(2)(ii)','Required'],
['D05','documentation','Updates','Review documentation periodically and update it in response to environmental or operational changes affecting ePHI security.','Inspect review dates, change triggers, revision history, approvals, and communication.','164.316(b)(2)(iii)','Required']
].map(([id, category, title, text, prompt, cite, type]) => ({ id, category, title, text, prompt, cite, type }));

const CONTROL_BY_ID = Object.fromEntries(CONTROLS.map(c => [c.id, c]));

/* Safeguard status vocabulary. `key` is the stored value; `label` is what prints. */
const STATUSES = {
  'met':     { key: 'met',     label: 'Met',            short: 'Met',      tone: 'good',    definition: 'The safeguard is implemented, operating as intended, and supported by evidence reviewed during the assessment.' },
  'partial': { key: 'partial', label: 'Partially met',  short: 'Partial',  tone: 'warn',    definition: 'The safeguard is implemented in part, inconsistently, or without adequate evidence; a corrective action is required.' },
  'not-met': { key: 'not-met', label: 'Not met',        short: 'Not met',  tone: 'crit',    definition: 'The safeguard is absent or ineffective. The organization has an open gap against the Security Rule requirement.' },
  'na':      { key: 'na',      label: 'Not applicable', short: 'N/A',      tone: 'na',      definition: 'The standard or specification does not apply to the organization. The applicability basis is documented in the assessment notes.' }
};

const LIKELIHOOD = [
  [1, 'Rare',        'Would only occur in exceptional circumstances; strong compensating controls are in place.'],
  [2, 'Unlikely',    'Could occur at some time but is not expected; controls reduce exposure substantially.'],
  [3, 'Possible',    'Might occur at some time; partial controls or known weaknesses exist.'],
  [4, 'Likely',      'Will probably occur in most circumstances; weak or missing controls, or prior incidents.'],
  [5, 'Almost certain', 'Expected to occur; active threat activity with no effective control.']
];

const IMPACT = [
  [1, 'Negligible',  'Minimal effect; no ePHI disclosure, brief disruption, no regulatory exposure.'],
  [2, 'Minor',       'Limited ePHI exposure or short outage; handled with routine procedures.'],
  [3, 'Moderate',    'Confirmed ePHI exposure or disruption requiring formal response; possible breach notification.'],
  [4, 'Major',       'Significant ePHI breach or prolonged outage affecting patient care, with regulatory and financial consequences.'],
  [5, 'Severe',      'Large-scale breach, patient safety impact, enforcement action, or threat to organizational viability.']
];

const RISK_LEVELS = [
  { key: 'low',    label: 'Low',    min: 1,  max: 7,  tone: 'good', guidance: 'Monitor and address through routine operations. Accept with documented rationale where appropriate.' },
  { key: 'medium', label: 'Medium', min: 8,  max: 14, tone: 'warn', guidance: 'Plan remediation within the assessment cycle. Assign an owner and target date.' },
  { key: 'high',   label: 'High',   min: 15, max: 25, tone: 'crit', guidance: 'Prioritize immediate remediation or compensating controls. Escalate to management for acceptance decisions.' }
];

function riskLevel(score) {
  const n = Number(score) || 0;
  return RISK_LEVELS.find(l => n >= l.min && n <= l.max) || RISK_LEVELS[0];
}

const DECISIONS = ['Mitigate', 'Accept', 'Transfer', 'Avoid'];
const RISK_STATUSES = ['Open', 'In progress', 'Closed'];
const CLASSIFICATIONS = ['Confidential', 'Restricted', 'Internal use only'];

/* Common threat scenarios that can pre-fill a risk register entry. */
const THREATS = [
  { text: 'Ransomware or destructive malware encrypts or destroys systems that store ePHI.', controls: 'A17, A23, A24, T06' },
  { text: 'Phishing or credential theft compromises workforce email or EHR accounts.', controls: 'A15, A19, T09' },
  { text: 'A laptop, phone, or removable media containing unencrypted ePHI is lost or stolen.', controls: 'P08, P11, T05' },
  { text: 'A workforce member accesses patient records without a business need (snooping or insider misuse).', controls: 'A05, A11, T06' },
  { text: 'A business associate or cloud vendor suffers a breach that exposes the organization\'s ePHI.', controls: 'A29, O01' },
  { text: 'Paper records or devices containing ePHI are disposed of without sanitization or destruction.', controls: 'P09, P10' },
  { text: 'ePHI is transmitted without encryption (email, file transfer, fax-to-email, messaging).', controls: 'T10, T12' },
  { text: 'Unpatched or end-of-life systems expose known vulnerabilities to exploitation.', controls: 'A01, A17, T07' },
  { text: 'Backups fail, are incomplete, or cannot be restored when needed.', controls: 'A23, A24, A26' },
  { text: 'A natural disaster, fire, flood, or extended power or network outage disrupts access to ePHI.', controls: 'A22, A25, P02' },
  { text: 'Misconfigured cloud storage or file sharing exposes ePHI to unauthorized parties.', controls: 'T01, T10, A28' },
  { text: 'Access for a departed workforce member is not removed promptly.', controls: 'A10, A14' },
  { text: 'Shared or generic accounts prevent accountability for ePHI access.', controls: 'T02, T06' },
  { text: 'Audit logs are not collected or reviewed, so unauthorized activity goes undetected.', controls: 'A05, A18, T06' },
  { text: 'An unauthorized person enters a restricted area (tailgating, unlocked doors, unattended workstations).', controls: 'P01, P03, P07' },
  { text: 'Business associate agreements are missing, expired, or do not cover all vendors handling ePHI.', controls: 'A29, O01' },
  { text: 'Remote access or email is protected by a password alone, without multi-factor authentication.', controls: 'A19, T09' },
  { text: 'Workforce members have not completed security awareness training or role-based refreshers.', controls: 'A15, A16' }
];

/* Report readiness checks. Each returns true when the assessment is complete for that item. */
const READINESS_CHECKS = [
  { key: 'profile',   label: 'Organization, assessment date, lead assessor, and scope statement recorded' },
  { key: 'inventory', label: 'At least one ePHI system or location inventoried with data and flow details' },
  { key: 'reviewed',  label: 'All 61 Security Rule safeguards reviewed' },
  { key: 'gapnotes',  label: 'Assessment notes recorded for every partial, not-met, or not-applicable safeguard' },
  { key: 'risks',     label: 'Every recorded risk has a description, owner, target date, and treatment plan' },
  { key: 'approval',  label: 'Management approver and approval date recorded' }
];
