// 민감 정보 마스킹 미들웨어

function maskSsn(ssn) {
  if (!ssn || ssn.length < 8) return ssn;
  // 830505-1****** 형태
  const clean = ssn.replace(/-/g, '');
  if (clean.length >= 7) {
    return clean.substring(0, 6) + '-' + clean.charAt(6) + '******';
  }
  return ssn;
}

function maskPhone(phone) {
  if (!phone) return phone;
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length >= 10) {
    return clean.substring(0, 3) + '-****-' + clean.substring(clean.length - 4);
  }
  return phone;
}

function maskAccount(account) {
  if (!account || account.length < 6) return account;
  return account.substring(0, 4) + '****' + account.substring(account.length - 4);
}

function maskCustomer(customer) {
  if (!customer) return customer;
  return {
    ...customer,
    ssn: maskSsn(customer.ssn),
    phone: customer.phone, // 전화번호는 업무상 필요하므로 유지
    phone2: customer.phone2 ? maskPhone(customer.phone2) : '',
    refund_account: maskAccount(customer.refund_account),
  };
}

function maskCustomerList(customers) {
  return customers.map(maskCustomer);
}

module.exports = { maskSsn, maskPhone, maskAccount, maskCustomer, maskCustomerList };
