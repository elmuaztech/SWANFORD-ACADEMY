/**
 * Swanford Academy — User-Facing Error Translation Layer
 *
 * Principle 4: Never expose developer language, database exceptions,
 * internal IDs, or stack traces to normal users.
 */

export interface TranslatedMessage {
  title: string;
  message: string;
  actionText?: string;
}

/**
 * Maps any error or technical code into dignified, professional,
 * human-readable copy suitable for parents, teachers, and administrators.
 */
export function toUserFacingError(error: unknown): TranslatedMessage {
  // If error is null or undefined
  if (!error) {
    return {
      title: "Unable to Complete Action",
      message: "We couldn't complete this request. Please try again.",
      actionText: "Try Again",
    };
  }

  const rawMessage = typeof error === "string" 
    ? error 
    : (error as Record<string, unknown>)?.message 
      ? String((error as Record<string, unknown>).message) 
      : "";

  const rawCode = (error as Record<string, unknown>)?.code
    ? String((error as Record<string, unknown>).code)
    : "";

  // 1. Prisma Unique Constraint / Duplicate Records (P2002)
  if (rawCode === "P2002" || /unique constraint/i.test(rawMessage)) {
    if (/email/i.test(rawMessage)) {
      return {
        title: "Email Already in Use",
        message: "An account with this email address is already registered in the system.",
      };
    }
    if (/phone/i.test(rawMessage)) {
      return {
        title: "Phone Number Already in Use",
        message: "This phone number is already registered to another guardian or staff member.",
      };
    }
    if (/admissionNumber/i.test(rawMessage) || /matriculationNumber/i.test(rawMessage)) {
      return {
        title: "Registration Number Already Assigned",
        message: "This student registration or admission number is already in use.",
      };
    }
    return {
      title: "Duplicate Information",
      message: "A record with this information already exists in the academy's records.",
    };
  }

  // 2. Foreign Key Constraint / Record Not Found (P2003, P2025)
  if (rawCode === "P2025" || /record to update not found/i.test(rawMessage) || /not found/i.test(rawMessage)) {
    return {
      title: "Record Not Found",
      message: "The requested record could not be found. It may have been updated or removed by another user.",
    };
  }
  if (rawCode === "P2003" || /foreign key constraint/i.test(rawMessage)) {
    return {
      title: "Linked Information Missing",
      message: "This record is associated with other school information that could not be verified.",
    };
  }

  // 3. Database connection / transaction / server issues
  if (
    /connection/i.test(rawMessage) ||
    /timeout/i.test(rawMessage) ||
    /postgres/i.test(rawMessage) ||
    /prisma/i.test(rawMessage) ||
    /transaction/i.test(rawMessage) ||
    /network/i.test(rawMessage)
  ) {
    return {
      title: "Service Temporarily Unavailable",
      message: "We were unable to connect to the academy server. Please check your network connection and try again.",
      actionText: "Try Again",
    };
  }

  // 4. Payment Session Expiration (Public / Checkout)
  if (/payment session/i.test(rawMessage)) {
    return {
      title: "Checkout Unavailable",
      message: "This payment session has timed out. Please refresh the page to restart your payment.",
      actionText: "Refresh Page",
    };
  }

  // 5. Authentication / Session Expiration
  if (/session/i.test(rawMessage) || /unauthorized/i.test(rawMessage) || /jwt/i.test(rawMessage) || /token/i.test(rawMessage)) {
    return {
      title: "Session Expired",
      message: "Your session has expired. Please sign in again to continue.",
      actionText: "Sign In",
    };
  }

  // 5. Permission / Access Denied
  if (/forbidden/i.test(rawMessage) || /permission/i.test(rawMessage) || /access denied/i.test(rawMessage)) {
    return {
      title: "Access Restricted",
      message: "You do not have administrative permission to view or modify this information.",
    };
  }

  // 6. Security / Cryptographic errors
  if (/argon/i.test(rawMessage) || /bcrypt/i.test(rawMessage) || /crypto/i.test(rawMessage) || /hash/i.test(rawMessage)) {
    return {
      title: "Security Verification Failed",
      message: "The credentials provided could not be verified securely. Please check your password and try again.",
    };
  }

  // 7. Payment / Financial specific errors
  if (/overpayment/i.test(rawMessage)) {
    return {
      title: "Payment Exceeds Balance",
      message: "The payment amount exceeds the outstanding balance on this invoice.",
    };
  }
  if (/underpayment/i.test(rawMessage) || /zero/i.test(rawMessage)) {
    return {
      title: "Invalid Payment Amount",
      message: "Payment amounts must be greater than zero.",
    };
  }
  if (/reversed/i.test(rawMessage) || /void/i.test(rawMessage)) {
    return {
      title: "Transaction Unavailable",
      message: "This transaction has already been reversed or cancelled.",
    };
  }

  // Fallback safe professional human-readable message
  // If the rawMessage itself is already clean and does not contain technical keywords, we can display it
  const isTechnical = /SELECT|INSERT|UPDATE|DELETE|prisma|postgres|stack|error:|at\s+\w+|object\s+Object/i.test(rawMessage);

  if (!isTechnical && rawMessage.length > 5 && rawMessage.length < 150) {
    return {
      title: "Action Notice",
      message: rawMessage.endsWith(".") ? rawMessage : `${rawMessage}.`,
    };
  }

  return {
    title: "Request Could Not Be Completed",
    message: "We couldn't complete this request. Please try again or contact school administration if the issue persists.",
    actionText: "Try Again",
  };
}
